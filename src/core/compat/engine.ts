import type { ArtifactRegistry } from "../artifacts/registry";
import { COMPRESSION_LABEL, detectCompression, isDecompressionSupported, sectionOf } from "../image";
import type { ParsedImage } from "../image";
import type { ProviderRegistry } from "../patch/providers/registry";
import type { PatchProviderDescriptor } from "../patch/types";
import type { CompatibilityResult, CompatibilityWarning, PatchCandidate } from "./types";

export interface CompatibilityInput {
  image: ParsedImage;
  providers: ProviderRegistry;
  artifacts: ArtifactRegistry;
}

function evaluateCandidate(
  descriptor: PatchProviderDescriptor,
  input: CompatibilityInput,
): PatchCandidate {
  const image = input.image;
  const artifacts = input.artifacts;
  const reasons: string[] = [];
  const warnings: CompatibilityWarning[] = [];
  const available = input.providers.get(descriptor.id) !== undefined;

  if (descriptor.status === "planned" || !available) {
    reasons.push("Not implemented in this build.");
    return {
      providerId: descriptor.id,
      name: descriptor.name,
      description: descriptor.description,
      status: descriptor.status,
      available: false,
      compatible: false,
      reasons,
      warnings,
    };
  }

  if (!descriptor.supportedFormats.includes(image.format)) {
    reasons.push("Does not support " + image.format + " images.");
  }
  if (!descriptor.supportedHeaderVersions.includes(image.headerVersion)) {
    reasons.push("Boot header v" + image.headerVersion + " is outside the supported range.");
  }
  if (image.architecture === null) {
    warnings.push({
      code: "unknown-architecture",
      message: "The kernel architecture could not be determined; architecture checks were skipped.",
      severity: "warning",
    });
  } else if (!descriptor.supportedArchitectures.includes(image.architecture)) {
    reasons.push("Architecture " + image.architecture + " is not supported.");
  }

  const kernelSection = sectionOf(image, "kernel");
  if (descriptor.requiresKernel && (!kernelSection || kernelSection.size === 0)) {
    reasons.push("The image has no kernel section to patch.");
  }

  const ramdisk = sectionOf(image, "ramdisk") ?? sectionOf(image, "vendor_ramdisk");
  if (descriptor.requiresRamdisk && !ramdisk) {
    reasons.push("The image has no ramdisk section.");
  } else if (ramdisk) {
    const compression = detectCompression(ramdisk.data);
    if (!isDecompressionSupported(compression)) {
      warnings.push({
        code: "unsupported-compression",
        message:
          COMPRESSION_LABEL[compression] +
          " ramdisk payloads cannot be expanded in this build; the compressed payload would be copied unchanged.",
        severity: "warning",
      });
    }
  }

  const releases = artifacts.releases(descriptor.id);
  if (releases.length === 0) {
    reasons.push("No artifact release is registered for this provider.");
  }

  return {
    providerId: descriptor.id,
    name: descriptor.name,
    description: descriptor.description,
    status: descriptor.status,
    available,
    compatible: reasons.length === 0,
    reasons,
    warnings,
  };
}

export function evaluateCompatibility(input: CompatibilityInput): CompatibilityResult {
  const candidates = input.providers
    .descriptors()
    .map((descriptor) => evaluateCandidate(descriptor, input));

  const warnings = candidates.flatMap((candidate) => candidate.warnings.map((warning) => warning.message));
  const errors = candidates
    .filter((candidate) => candidate.available && !candidate.compatible)
    .flatMap((candidate) => candidate.reasons.map((reason) => candidate.name + ": " + reason));

  return {
    compatible: candidates.some((candidate) => candidate.compatible),
    warnings,
    errors,
    candidates,
  };
}
