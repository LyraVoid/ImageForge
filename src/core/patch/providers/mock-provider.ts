import type { ArtifactRegistry } from "../../artifacts/registry";
import { canonicalize } from "../../canonical";
import { AbortedError, ArtifactError } from "../../errors";
import { sha256Hex } from "../../hash";
import { repackBootImage, sectionOf, verifyImage } from "../../image";
import type { ParsedImage, VerifyExpectations } from "../../image";
import type {
  PatchAnalysis,
  PatchOptions,
  PatchPlan,
  PatchPlanContext,
  PatchPlanStep,
  PatchProvider,
  PatchResult,
  PatchRunContext,
  PatchStage,
  PatchVerificationResult,
} from "../types";

export const MOCK_CMDLINE_MARKER = "imageforge.mock=1";
export const MOCK_BOOTCONFIG_MARKER = "imageforge_mock";

const PLAN_STEPS: PatchPlanStep[] = [
  { id: "analyze", label: "Analyze image", progress: 0 },
  { id: "extract", label: "Extract sections", progress: 20 },
  { id: "prepare", label: "Prepare payload", progress: 40 },
  { id: "patch", label: "Apply mock patch", progress: 60 },
  { id: "repack", label: "Repack boot image", progress: 80 },
  { id: "verify", label: "Verify output", progress: 95 },
];

function appendCmdlineMarker(cmdline: string, marker: string): string {
  const trimmed = cmdline.trim();
  if (trimmed.includes(marker)) return trimmed;
  return (trimmed + " " + marker).trim();
}

function buildManifest(plan: PatchPlan): string {
  return [
    "# imageforge mock patch manifest",
    MOCK_BOOTCONFIG_MARKER + "=1",
    "imageforge_provider=" + plan.providerId,
    "imageforge_provider_name=" + plan.providerName,
    "imageforge_release=" + plan.release,
    "imageforge_artifact=" + plan.artifact.id + "@" + plan.artifact.version,
    "imageforge_artifact_sha256=" + (plan.artifact.sha256 ?? "unknown"),
    "imageforge_plan=" + plan.id,
    "imageforge_source_sha256=" + plan.sourceImageSha256,
    "imageforge_note=structural placeholder patch, not a root solution",
    "",
  ].join("\n");
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

export class MockPatchProvider implements PatchProvider {
  readonly id = "mock";
  readonly name = "Mock Provider";
  private readonly artifacts: ArtifactRegistry;

  constructor(artifacts: ArtifactRegistry) {
    this.artifacts = artifacts;
  }

  async analyze(image: ParsedImage): Promise<PatchAnalysis> {
    return {
      providerId: this.id,
      summary:
        "Exercises the complete pipeline without touching root: the kernel cmdline and the bootconfig manifest are rewritten so the result can be verified.",
      supportedTargets: ["boot", "init_boot"],
      notes: [
        "The Mock Provider never claims to root a device and leaves the ramdisk contents untouched.",
        "Header v" + image.headerVersion + " images are accepted for this placeholder pipeline.",
      ],
    };
  }

  async resolve(
    image: ParsedImage,
    options: PatchOptions,
    sourceImageSha256: string,
    _planContext?: PatchPlanContext,
  ): Promise<PatchPlan> {
    const resolved = this.artifacts.resolve({
      providerId: this.id,
      ...(options.release === undefined ? {} : { release: options.release }),
      ...(options.artifactId === undefined ? {} : { artifactId: options.artifactId }),
      ...(image.architecture === null ? {} : { architecture: image.architecture }),
    });
    const integrity = await this.artifacts.verifyIntegrity(resolved.artifact);
    if (!integrity.ok) {
      throw new ArtifactError(
        "Artifact " + resolved.artifact.id + " expected SHA-256 " + String(integrity.expectedSha256) + " but hashed to " + integrity.actualSha256 + ".",
      );
    }

    const plan: PatchPlan = {
      id: "",
      providerId: this.id,
      providerName: this.name,
      release: resolved.release.release,
      artifact: resolved.artifact,
      architecture: image.architecture ?? "unknown",
      target: image.format,
      headerVersion: image.headerVersion,
      pageSize: image.pageSize,
      sourceImageSha256,
      configuration: {
        ...(options.configuration ?? {}),
        cmdlineMarker: MOCK_CMDLINE_MARKER,
        manifestKind: image.headerVersion >= 3 ? "bootconfig" : "cmdline",
      },
      steps: PLAN_STEPS.map((step) => ({ ...step })),
      createdAt: new Date().toISOString(),
      reproducible: true,
      notes: [
        "Deterministic transformation: the same input bytes and plan always produce the same output bytes.",
        "No timestamps are embedded in the output image.",
      ],
    };
    plan.id = await computePlanId(plan);
    return plan;
  }

  async patch(image: ParsedImage, plan: PatchPlan, context: PatchRunContext): Promise<PatchResult> {
    const emit = (stage: PatchStage, progress: number, message: string): void => {
      if (context.signal?.aborted) throw new AbortedError();
      context.onProgress?.({ stage, progress, message });
    };

    emit("extract", 20, "Extracting image sections");
    const ramdisk = sectionOf(image, "ramdisk")?.data ?? sectionOf(image, "vendor_ramdisk")?.data;
    if (!ramdisk) {
      throw new ArtifactError("The image does not contain a ramdisk section to patch.", "No ramdisk payload found.");
    }

    emit("prepare", 40, "Preparing the mock manifest");
    const manifest = buildManifest(plan);
    const useBootconfig = image.headerVersion >= 3;
    const bootconfig = useBootconfig ? new TextEncoder().encode(manifest) : undefined;
    if (!useBootconfig && manifest.length > 0) {
      emit("prepare", 45, "Boot header v" + image.headerVersion + " has no bootconfig section; using the cmdline only");
    }
    const cmdline = appendCmdlineMarker(image.cmdline, MOCK_CMDLINE_MARKER);

    emit("patch", 60, "Applying the mock patch");
    const preserveImageSize = (context.options?.configuration?.preserveImageSize ?? "false") === "true";
    const outcome = repackBootImage({
      image,
      ramdisk,
      cmdline,
      ...(bootconfig === undefined ? {} : { bootconfig }),
      ...(preserveImageSize ? { padTo: image.totalSize } : {}),
    });

    emit("repack", 80, "Repacking the boot image");
    const sha256 = await sha256Hex(outcome.bytes);

    emit("verify", 95, "Verifying the produced image");
    return {
      plan,
      bytes: outcome.bytes,
      sha256,
      sizeBytes: outcome.bytes.length,
      warnings: [
        ...outcome.warnings,
        "The Mock Provider does not root the device and does not modify ramdisk contents.",
      ],
      metadata: {
        mock: "true",
        provider: plan.providerId,
        providerName: plan.providerName,
        release: plan.release,
        artifact: plan.artifact.id,
        artifactVersion: plan.artifact.version,
        artifactSha256: plan.artifact.sha256 ?? "unknown",
        artifactVerified: "true",
        target: plan.target,
        headerVersion: "v" + plan.headerVersion,
        manifestKind: useBootconfig ? "bootconfig" : "cmdline",
        imageSizeBefore: String(image.totalSize),
        imageSizeAfter: String(outcome.bytes.length),
        preserveImageSize: preserveImageSize ? "true" : "false",
        sourceImageSha256: plan.sourceImageSha256,
        planId: plan.id,
        reproducible: "true",
      },
    };
  }

  async verify(result: PatchResult, context?: PatchRunContext): Promise<PatchVerificationResult> {
    if (context?.signal?.aborted) throw new AbortedError();
    const expectations: VerifyExpectations = {
      format: result.plan.target,
      headerVersion: result.plan.headerVersion,
      cmdlineIncludes: MOCK_CMDLINE_MARKER,
    };
    if (result.plan.headerVersion >= 3) expectations.bootconfigIncludes = MOCK_BOOTCONFIG_MARKER;
    const verification = await verifyImage(result.bytes, expectations);
    return {
      verification,
      artifactSha256: result.plan.artifact.sha256,
      checks: verification.checks,
    };
  }
}
