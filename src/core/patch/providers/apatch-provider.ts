import type { ArtifactRegistry } from "../../artifacts/registry";
import type { PatchArtifact } from "../../artifacts/types";
import {
  APATCH_KPIMG_ID,
  APATCH_KPTOOLS_ID,
} from "../../artifacts/catalog";
import { canonicalize } from "../../canonical";
import { AbortedError, IncompatibleProviderError, PatchError } from "../../errors";
import { sha256Hex } from "../../hash";
import {
  COMPRESSION_LABEL,
  detectCompression,
  repackBootImage,
  sectionOf,
  verifyImage,
} from "../../image";
import type { ParsedImage, VerifyExpectations } from "../../image";
import { compileWasiModule, runWasiTool } from "../../../wasm/wasi-runner";
import type {
  PatchAnalysis,
  PatchOptions,
  PatchPlan,
  PatchPlanStep,
  PatchProvider,
  PatchResult,
  PatchRunContext,
  PatchVerificationResult,
} from "../types";

/** Plan configuration key holding an optional superkey. Empty means the APatch default. */
export const APATCH_SUPERKEY_SETTING = "superkey";

const KERNEL_FILE = "kernel";
const KPIMG_FILE = "kpimg";
const PATCHED_FILE = "kernel.patched";

const PLAN_STEPS: PatchPlanStep[] = [
  { id: "analyze", label: "Analyze boot image", progress: 0 },
  { id: "extract", label: "Extract kernel image", progress: 20 },
  { id: "prepare", label: "Load KernelPatch artifacts", progress: 40 },
  { id: "patch", label: "Inject KernelPatch into the kernel", progress: 60 },
  { id: "repack", label: "Repack the boot image", progress: 80 },
  { id: "verify", label: "Verify the produced image", progress: 95 },
];

function readSuperkey(configuration: Record<string, string> | undefined): string {
  return (configuration?.[APATCH_SUPERKEY_SETTING] ?? "").trim();
}

function versionFromStdout(lines: string[], fallback: string): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[0-9a-f]{1,8}$/i.test(trimmed)) return "0x" + trimmed.toLowerCase();
  }
  return fallback;
}

async function computePlanId(plan: PatchPlan): Promise<string> {
  const digest = await sha256Hex(
    new TextEncoder().encode(
      canonicalize({
        providerId: plan.providerId,
        release: plan.release,
        artifact: plan.artifact.id,
        artifactSha256: plan.artifact.sha256,
        architecture: plan.architecture,
        target: plan.target,
        headerVersion: plan.headerVersion,
        sourceImageSha256: plan.sourceImageSha256,
        configuration: plan.configuration,
      }),
    ),
  );
  return digest.slice(0, 32);
}

export class ApatchPatchProvider implements PatchProvider {
  readonly id = "apatch";
  readonly name = "APatch";
  private readonly artifacts: ArtifactRegistry;

  constructor(artifacts: ArtifactRegistry) {
    this.artifacts = artifacts;
  }

  async analyze(_image: ParsedImage): Promise<PatchAnalysis> {
    return {
      providerId: this.id,
      summary:
        "Injects the KernelPatch core image into the kernel inside boot.img using the upstream kptools build running in WebAssembly.",
      supportedTargets: ["boot"],
      notes: [
        "The kernel is patched, so boot.img is the only valid target: init_boot.img contains no kernel.",
        "CONFIG_KALLSYMS=y is verified on the target kernel before any patch is applied.",
        "The superkey is optional and left unset by default, matching the manager default where authentication is signature based.",
      ],
    };
  }

  private resolveArtifacts(): { kpimg: PatchArtifact; kptools: PatchArtifact } {
    const kpimg = this.artifacts.resolve({ providerId: this.id, artifactId: APATCH_KPIMG_ID });
    const kptools = this.artifacts.resolve({ providerId: this.id, artifactId: APATCH_KPTOOLS_ID });
    return { kpimg: kpimg.artifact, kptools: kptools.artifact };
  }

  private loadKernel(image: ParsedImage): Uint8Array {
    const kernel = sectionOf(image, "kernel");
    if (!kernel || kernel.size === 0) {
      throw new IncompatibleProviderError(
        "The image has no kernel section, so KernelPatch has nothing to inject into.",
        "This image has no kernel to patch.",
      );
    }
    const compression = detectCompression(kernel.data);
    if (compression !== "none" && compression !== "unknown") {
      throw new IncompatibleProviderError(
        "Kernel payload compression is " + COMPRESSION_LABEL[compression] + ".",
        "This build can only patch uncompressed arm64 kernel images.",
      );
    }
    return kernel.data;
  }

  async resolve(image: ParsedImage, options: PatchOptions, sourceImageSha256: string): Promise<PatchPlan> {
    if (image.format !== "boot") {
      throw new IncompatibleProviderError(
        "APatch targets the kernel, which only exists in boot images (found " + image.format + ").",
        "APatch can only patch boot.img.",
      );
    }

    const { kpimg, kptools } = this.resolveArtifacts();
    const kernel = this.loadKernel(image);

    const kptoolsBytes = await this.artifacts.loadVerifiedPayload(kptools);
    const module = await compileWasiModule(kptools.id + ":" + String(kptools.sha256), kptoolsBytes);

    const flags = await runWasiTool({
      module,
      args: ["-i", "/" + KERNEL_FILE, "-f"],
      files: { [KERNEL_FILE]: kernel },
    });
    const kallsymsEnabled = flags.stdout.some((line) => line.includes("CONFIG_KALLSYMS=y"));
    if (!kallsymsEnabled) {
      throw new IncompatibleProviderError(
        "kptools -f reported no CONFIG_KALLSYMS=y for this kernel (exit=" + flags.exitCode + ").",
        "This kernel does not enable CONFIG_KALLSYMS, which KernelPatch requires.",
      );
    }
    const kallsymsAll = flags.stdout.some((line) => line.includes("CONFIG_KALLSYMS_ALL=y"));

    const kpimgBytes = await this.artifacts.loadVerifiedPayload(kpimg);
    const kpimgInfo = await runWasiTool({
      module,
      args: ["-v", "-k", "/" + KPIMG_FILE],
      files: { [KPIMG_FILE]: kpimgBytes },
    });

    const superkey = readSuperkey(options.configuration);
    const plan: PatchPlan = {
      id: "",
      providerId: this.id,
      providerName: this.name,
      release: "11224",
      artifact: kpimg,
      architecture: image.architecture ?? "unknown",
      target: image.format,
      headerVersion: image.headerVersion,
      pageSize: image.pageSize,
      sourceImageSha256,
      configuration: {
        ...(options.configuration ?? {}),
        kernelPatchMode: "static",
        superkeyMode: superkey === "" ? "none" : "custom",
        kernelCompression: COMPRESSION_LABEL[detectCompression(kernel)],
        kernelSize: String(kernel.length),
        kallsyms: "enabled",
        kallsymsAll: kallsymsAll ? "enabled" : "disabled",
        kpimgVersion: versionFromStdout(kpimgInfo.stdout, kpimg.version),
        kptoolsVersion: kptools.version,
      },
      steps: PLAN_STEPS.map((step) => ({ ...step })),
      createdAt: new Date().toISOString(),
      reproducible: true,
      notes: [
        "KernelPatch is injected into the kernel image; the ramdisk and every other section are left untouched.",
        "Reproducible for the pinned kpimg and kptools artifacts: patching the same image twice yields identical kernel bytes, which the test suite enforces.",
        "The superkey is never written into the plan; only the mode is recorded.",
        kallsymsAll
          ? "CONFIG_KALLSYMS_ALL is enabled on this kernel."
          : "CONFIG_KALLSYMS_ALL is disabled: upstream warns the device may fail to boot afterwards.",
      ],
    };
    plan.id = await computePlanId(plan);
    return plan;
  }

  async patch(image: ParsedImage, plan: PatchPlan, context: PatchRunContext): Promise<PatchResult> {
    const emit = (stage: PatchPlanStep["id"] | "complete", progress: number, message: string): void => {
      if (context.signal?.aborted) throw new AbortedError();
      context.onProgress?.({ stage: stage as never, progress, message });
    };

    if (plan.target !== "boot") {
      throw new PatchError("APatch can only patch boot images (plan target is " + plan.target + ").");
    }

    emit("extract", 20, "Extracting the kernel image");
    const kernel = this.loadKernel(image);

    emit("prepare", 40, "Loading KernelPatch artifacts");
    const kptools = this.artifacts.resolve({ providerId: this.id, artifactId: APATCH_KPTOOLS_ID }).artifact;
    const kptoolsBytes = await this.artifacts.loadVerifiedPayload(kptools);
    const kpimgBytes = await this.artifacts.loadVerifiedPayload(plan.artifact);
    const module = await compileWasiModule(kptools.id + ":" + String(kptools.sha256), kptoolsBytes);

    emit("patch", 60, "Injecting KernelPatch into the kernel");
    const superkey = readSuperkey(context.options?.configuration);
    const patchArgs = ["-p", "-i", "/" + KERNEL_FILE, "-k", "/" + KPIMG_FILE, "-o", "/" + PATCHED_FILE];
    if (superkey !== "") patchArgs.push("-S", superkey);

    const run = await runWasiTool({
      module,
      args: patchArgs,
      files: { [KERNEL_FILE]: kernel, [KPIMG_FILE]: kpimgBytes },
      onStdout: (line) => context.onProgress?.({ stage: "patch", progress: 65, message: line }),
      onStderr: (line) => context.onProgress?.({ stage: "patch", progress: 65, message: line }),
      signal: context.signal,
    });
    if (run.exitCode !== 0) {
      throw new PatchError(
        "kptools exited with code " + run.exitCode + ": " + run.stderr.concat(run.stdout).slice(-4).join(" | "),
        "The KernelPatch injection failed.",
      );
    }

    const patchedKernel = run.files[PATCHED_FILE];
    if (!patchedKernel || patchedKernel.length === 0) {
      throw new PatchError("kptools did not produce a patched kernel image.", "The KernelPatch injection produced no output.");
    }

    const confirmation = await runWasiTool({
      module,
      args: ["-l", "-i", "/" + KERNEL_FILE, "-k", "/" + KPIMG_FILE],
      files: { [KERNEL_FILE]: patchedKernel, [KPIMG_FILE]: kpimgBytes },
      signal: context.signal,
    });
    const confirmed = confirmation.stdout.some((line) => line.includes("patched=true"));
    if (!confirmed) {
      throw new PatchError(
        "The patched kernel does not report patched=true: " + confirmation.stdout.slice(0, 6).join(" | "),
        "The KernelPatch injection could not be confirmed.",
      );
    }

    emit("repack", 80, "Repacking the boot image");
    const preserveImageSize = (context.options?.configuration?.preserveImageSize ?? "false") === "true";
    const outcome = repackBootImage({
      image,
      kernel: patchedKernel,
      ...(preserveImageSize ? { padTo: image.totalSize } : {}),
    });
    const sha256 = await sha256Hex(outcome.bytes);

    emit("verify", 95, "Verifying the produced image");
    const kernelSha256 = await sha256Hex(patchedKernel);

    return {
      plan,
      bytes: outcome.bytes,
      sha256,
      sizeBytes: outcome.bytes.length,
      warnings: [
        ...outcome.warnings,
        "APatch patches the kernel only; flashing this image is the user's responsibility and ImageForge never flashes devices.",
      ],
      metadata: {
        provider: plan.providerId,
        providerName: plan.providerName,
        release: plan.release,
        artifact: plan.artifact.id,
        artifactVersion: plan.artifact.version,
        artifactSha256: plan.artifact.sha256 ?? "unknown",
        kpimgVersion: plan.configuration.kpimgVersion ?? plan.artifact.version,
        kptoolsArtifact: kptools.id,
        kptoolsVersion: kptools.version,
        kptoolsSha256: kptools.sha256 ?? "unknown",
        superkeyMode: superkey === "" ? "none" : "custom",
        kernelSha256,
        kernelSizeBefore: String(kernel.length),
        kernelSizeAfter: String(patchedKernel.length),
        imageSizeBefore: String(image.totalSize),
        imageSizeAfter: String(outcome.bytes.length),
        preserveImageSize: preserveImageSize ? "true" : "false",
        kptoolsConfirmation: "patched=true",
        target: plan.target,
        headerVersion: "v" + plan.headerVersion,
        sourceImageSha256: plan.sourceImageSha256,
        planId: plan.id,
        reproducible: "not verified",
      },
    };
  }

  async verify(result: PatchResult, context?: PatchRunContext): Promise<PatchVerificationResult> {
    if (context?.signal?.aborted) throw new AbortedError();
    const expectations: VerifyExpectations = {
      format: "boot",
      headerVersion: result.plan.headerVersion,
    };
    const kernelSha256 = result.metadata.kernelSha256;
    if (kernelSha256) expectations.kernelSha256 = kernelSha256;
    const verification = await verifyImage(result.bytes, expectations);
    return {
      verification,
      artifactSha256: result.plan.artifact.sha256,
      checks: verification.checks,
    };
  }
}
