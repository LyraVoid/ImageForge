import type { ArtifactRegistry } from "../../artifacts/registry";
import type { PatchArtifact } from "../../artifacts/types";
import {
  APATCH_KPIMG_ASTER_ID,
  APATCH_KPIMG_ID,
  APATCH_KPTOOLS_ID,
} from "../../artifacts/catalog";
import { canonicalize } from "../../canonical";
import { AbortedError, IncompatibleProviderError, PatchError } from "../../errors";
import { sha256Hex } from "../../hash";
import {
  COMPRESSION_LABEL,
  compressSection,
  decompressSection,
  describeCompression,
  isPayloadUsable,
  repackBootImage,
  sectionOf,
  verifyImage,
} from "../../image";
import type { CompressionDescriptor } from "../../image";
import type { ParsedImage, VerifyExpectations } from "../../image";
import { compileWasiModule, runWasiTool } from "../../../wasm/wasi-runner";
import { describeKpm, readKpmInfo } from "./kpm-info";
import type {
  PatchAnalysis,
  PatchOptions,
  PatchPlan,
  PatchPlanContext,
  PatchPlanStep,
  PatchProvider,
  PatchResult,
  PatchRunContext,
  PatchVerificationResult,
} from "../types";

/** Plan configuration key holding an optional superkey. Empty means the APatch default. */
export const APATCH_SUPERKEY_SETTING = "superkey";

/** Plan configuration key selecting which KernelPatch core image is injected. */
export const APATCH_FLAVOR_SETTING = "kernelPatchFlavor";

/** Plan configuration key listing the KernelPatch modules embedded into the image. */
export const APATCH_KPM_SETTING = "kpmModules";

function readModuleNames(configuration: Record<string, string> | undefined): string[] {
  const raw = (configuration?.[APATCH_KPM_SETTING] ?? "").trim();
  if (raw === "" || raw === "none") return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export interface ApatchFlavor {
  id: string;
  label: string;
  artifactId: string;
  /** The manager package the injected KernelPatch trusts. */
  managerPackage: string;
  source: string;
}

export const APATCH_FLAVORS: ApatchFlavor[] = [
  {
    id: "upstream",
    label: "Upstream KernelPatch",
    artifactId: APATCH_KPIMG_ID,
    managerPackage: "me.bmax.apatch",
    source: "official APatch release 11224 (KernelPatch 0.13.3)",
  },
  {
    id: "aster",
    label: "Aster fork",
    artifactId: APATCH_KPIMG_ASTER_ID,
    managerPackage: "me.yuki.aster",
    source:
      "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981 (upstream 0.13.8 plus the Aster manager trust commit)",
  },
];

export const APATCH_DEFAULT_FLAVOR = "upstream";

function resolveFlavor(configuration: Record<string, string> | undefined): ApatchFlavor {
  const requested = (configuration?.[APATCH_FLAVOR_SETTING] ?? APATCH_DEFAULT_FLAVOR).trim().toLowerCase();
  const flavor = APATCH_FLAVORS.find((entry) => entry.id === requested);
  if (!flavor) {
    throw new IncompatibleProviderError(
      "Unknown KernelPatch flavour " + JSON.stringify(requested) + ".",
      "This KernelPatch flavour is not registered in the artifact registry.",
    );
  }
  return flavor;
}

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

  private resolveArtifacts(flavor: ApatchFlavor): {
    kpimg: PatchArtifact;
    kptools: PatchArtifact;
    release: string;
  } {
    const kpimg = this.artifacts.resolve({ providerId: this.id, artifactId: flavor.artifactId });
    const kptools = this.artifacts.resolve({ providerId: this.id, artifactId: APATCH_KPTOOLS_ID });
    return { kpimg: kpimg.artifact, kptools: kptools.artifact, release: kpimg.release.release };
  }

  /**
   * Returns the raw kernel section together with the descriptor needed to write the
   * exact same container again after patching.
   */
  private loadKernel(image: ParsedImage): { bytes: Uint8Array; descriptor: CompressionDescriptor } {
    const kernel = sectionOf(image, "kernel");
    if (!kernel || kernel.size === 0) {
      throw new IncompatibleProviderError(
        "The image has no kernel section, so KernelPatch has nothing to inject into.",
        "This image has no kernel to patch.",
      );
    }
    const descriptor = describeCompression(kernel.data);
    if (!isPayloadUsable(descriptor.format)) {
      throw new IncompatibleProviderError(
        "Kernel payload compression is " + COMPRESSION_LABEL[descriptor.format] + ".",
        "This build cannot expand that kernel compression, so the kernel cannot be patched safely.",
      );
    }
    return { bytes: kernel.data, descriptor };
  }

  async resolve(
    image: ParsedImage,
    options: PatchOptions,
    sourceImageSha256: string,
    planContext?: PatchPlanContext,
  ): Promise<PatchPlan> {
    if (image.format !== "boot") {
      throw new IncompatibleProviderError(
        "APatch targets the kernel, which only exists in boot images (found " + image.format + ").",
        "APatch can only patch boot.img.",
      );
    }

    const flavor = resolveFlavor(options.configuration);
    const { kpimg, kptools, release } = this.resolveArtifacts(flavor);
    const kernel = this.loadKernel(image);
    const rawKernel = await decompressSection(kernel.bytes, kernel.descriptor);

    const kptoolsBytes = await this.artifacts.loadVerifiedPayload(kptools);
    const module = await compileWasiModule(kptools.id + ":" + String(kptools.sha256), kptoolsBytes);

    const flags = await runWasiTool({
      module,
      args: ["-i", "/" + KERNEL_FILE, "-f"],
      files: { [KERNEL_FILE]: rawKernel },
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
    // Modules the run carries are authoritative: the plan must pin exactly those.
    const carriedModules = planContext?.attachmentNames ?? [];
    const moduleNames = carriedModules.length > 0 ? carriedModules : readModuleNames(options.configuration);
    // The superkey is a credential. It is used for this run and never written into the plan,
    // which is displayed in the UI and exported with the result.
    const { superkey: _superkey, ...configurationWithoutSecret } = options.configuration ?? {};
    const plan: PatchPlan = {
      id: "",
      providerId: this.id,
      providerName: this.name,
      release,
      artifact: kpimg,
      architecture: image.architecture ?? "unknown",
      target: image.format,
      headerVersion: image.headerVersion,
      pageSize: image.pageSize,
      sourceImageSha256,
      configuration: {
        ...configurationWithoutSecret,
        kernelPatchMode: "static",
        kernelPatchFlavor: flavor.id,
        kernelPatchSource: flavor.source,
        requiredManager: flavor.managerPackage,
        superkeyMode: superkey === "" ? "none" : "custom",
        kernelCompression: COMPRESSION_LABEL[kernel.descriptor.format],
        kernelSize: String(rawKernel.length),
        kernelSectionSize: String(kernel.bytes.length),
        [APATCH_KPM_SETTING]: moduleNames.length === 0 ? "none" : moduleNames.join(","),
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
        "The " + flavor.label + " core image only trusts the " + flavor.managerPackage + " manager, which must be installed for the patch to be usable.",
        moduleNames.length === 0
          ? "No KernelPatch modules are embedded."
          : moduleNames.length +
            " KernelPatch module(s) will be embedded: " +
            moduleNames.join(", ") +
            ". The modules stay in the browser and their licences are the user's responsibility.",
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

    emit("extract", 20, "Extracting and expanding the kernel image");
    const kernel = this.loadKernel(image);
    const rawKernel = await decompressSection(kernel.bytes, kernel.descriptor);

    emit("prepare", 40, "Loading KernelPatch artifacts");
    const kptools = this.artifacts.resolve({ providerId: this.id, artifactId: APATCH_KPTOOLS_ID }).artifact;
    const kptoolsBytes = await this.artifacts.loadVerifiedPayload(kptools);
    const kpimgBytes = await this.artifacts.loadVerifiedPayload(plan.artifact);
    const module = await compileWasiModule(kptools.id + ":" + String(kptools.sha256), kptoolsBytes);

    emit("patch", 60, "Injecting KernelPatch into the kernel");
    const superkey = readSuperkey(context.options?.configuration);
    const patchArgs = ["-p", "-i", "/" + KERNEL_FILE, "-k", "/" + KPIMG_FILE, "-o", "/" + PATCHED_FILE];
    if (superkey !== "") patchArgs.push("-S", superkey);

    // KernelPatch modules: the plan pins the names, this run carries the bytes.
    const plannedModules = readModuleNames(plan.configuration);
    const attachments = context.attachments ?? [];
    for (const attachment of attachments) {
      if (!plannedModules.includes(attachment.name)) {
        throw new PatchError(
          "Attachment " + attachment.name + " is not part of the plan (" + plannedModules.join(", ") + ").",
          "Re-plan after attaching or removing KernelPatch modules.",
        );
      }
    }
    const moduleFiles: Record<string, Uint8Array> = {};
    for (const attachment of attachments) {
      try {
        readKpmInfo(attachment.bytes);
      } catch (error) {
        throw new PatchError(
          attachment.name + " is not a valid KernelPatch module: " + (error as Error).message,
          "A KernelPatch module has to be a relocatable aarch64 ELF with a .kpm.info section.",
        );
      }
      moduleFiles[attachment.name] = attachment.bytes;
      // Same option shape the FolkTool uses: one -M/-N/-T group per module.
      patchArgs.push("-M", "/" + attachment.name, "-N", attachment.name, "-T", "kpm");
    }
    if (attachments.length > 0) {
      emit("patch", 62, "Embedding " + attachments.length + " KernelPatch module(s)");
    }

    const run = await runWasiTool({
      module,
      args: patchArgs,
      files: { [KERNEL_FILE]: rawKernel, [KPIMG_FILE]: kpimgBytes, ...moduleFiles },
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
    const reportedModules = Number(
      (confirmation.stdout.find((line) => /^num=\d+$/.test(line.trim())) ?? "num=0").trim().slice(4),
    );
    if (reportedModules !== attachments.length) {
      throw new PatchError(
        "kptools reported " + reportedModules + " embedded module(s) but " + attachments.length + " were requested.",
        "The embedded KernelPatch modules could not be confirmed.",
      );
    }

    emit("repack", 80, "Repacking the boot image");
    const preserveImageSize =
      (context.options?.configuration?.preserveImageSize ?? plan.configuration.preserveImageSize ?? "false") ===
      "true";
    const recompressed = await compressSection(patchedKernel, kernel.descriptor);
    const outcome = repackBootImage({
      image,
      kernel: recompressed,
      ...(preserveImageSize ? { padTo: image.totalSize } : {}),
    });
    const sha256 = await sha256Hex(outcome.bytes);

    emit("verify", 95, "Verifying the produced image");
    const kernelSha256 = await sha256Hex(patchedKernel);
    const kernelSectionSha256 = await sha256Hex(recompressed);

    const moduleDigests: string[] = [];
    for (const attachment of attachments) {
      const info = readKpmInfo(attachment.bytes);
      moduleDigests.push(
        describeKpm(info) +
          " (" +
          attachment.name +
          ", " +
          attachment.bytes.length +
          " bytes, sha256 " +
          (await sha256Hex(attachment.bytes)).slice(0, 16) +
          ")",
      );
    }

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
        kpmCount: String(attachments.length),
        kpmModules: moduleDigests.length === 0 ? "none" : moduleDigests.join(","),
        kernelPatchFlavor: plan.configuration.kernelPatchFlavor ?? APATCH_DEFAULT_FLAVOR,
        requiredManager: plan.configuration.requiredManager ?? "unknown",
        kernelSha256,
        kernelSectionSha256,
        kernelCompression: COMPRESSION_LABEL[kernel.descriptor.format],
        kernelSizeBefore: String(kernel.bytes.length),
        kernelSizeAfter: String(recompressed.length),
        kernelRawSizeBefore: String(rawKernel.length),
        kernelRawSizeAfter: String(patchedKernel.length),
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
    const kernelSectionSha256 = result.metadata.kernelSectionSha256 ?? result.metadata.kernelSha256;
    if (kernelSectionSha256) expectations.kernelSha256 = kernelSectionSha256;
    const verification = await verifyImage(result.bytes, expectations);
    return {
      verification,
      artifactSha256: result.plan.artifact.sha256,
      checks: verification.checks,
    };
  }
}
