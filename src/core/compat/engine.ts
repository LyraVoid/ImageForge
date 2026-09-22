import type { ArtifactRegistry } from "../artifacts/registry";
import { COMPRESSION_LABEL, detectCompression, isPayloadUsable, sectionOf } from "../image";
import type { ParsedImage } from "../image";
import type { ProviderRegistry } from "../patch/providers/registry";
import type { PatchProviderDescriptor } from "../patch/types";
import type {
  CompatibilityReason,
  CompatibilityResult,
  CompatibilityWarning,
  PatchCandidate,
} from "./types";

export interface CompatibilityInput {
  image: ParsedImage;
  providers: ProviderRegistry;
  artifacts: ArtifactRegistry;
}

/**
 * Reasons are collected as a code plus parameters and rendered into the English sentence the rest
 * of the engine uses. Collecting them together is what keeps the two lists from drifting: a new
 * reason cannot reach the interface without a code the interface can translate.
 */
function reasonCollector(): {
  add: (code: string, message: string, params?: Record<string, string>) => void;
  messages: string[];
  details: CompatibilityReason[];
} {
  const messages: string[] = [];
  const details: CompatibilityReason[] = [];
  return {
    messages,
    details,
    add: (code, message, params) => {
      messages.push(message);
      details.push(params === undefined ? { code } : { code, params });
    },
  };
}

function evaluateCandidate(
  descriptor: PatchProviderDescriptor,
  input: CompatibilityInput,
): PatchCandidate {
  const image = input.image;
  const artifacts = input.artifacts;
  const reasons = reasonCollector();
  const warnings: CompatibilityWarning[] = [];
  const available = input.providers.get(descriptor.id) !== undefined;

  if (descriptor.status === "planned" || !available) {
    reasons.add("not-implemented", "Not implemented in this build.");
    return {
      providerId: descriptor.id,
      name: descriptor.name,
      description: descriptor.description,
      status: descriptor.status,
      available: false,
      compatible: false,
      reasons: reasons.messages,
      reasonDetails: reasons.details,
      warnings,
    };
  }

  if (!descriptor.supportedFormats.includes(image.format)) {
    reasons.add("format", "Does not support " + image.format + " images.", { format: image.format });
  }
  if (!descriptor.supportedHeaderVersions.includes(image.headerVersion)) {
    reasons.add("header", "Boot header v" + image.headerVersion + " is outside the supported range.", {
      version: String(image.headerVersion),
    });
  }
  if (image.architecture === null) {
    warnings.push({
      code: "unknown-architecture",
      message: "The kernel architecture could not be determined; architecture checks were skipped.",
      severity: "warning",
    });
  } else if (!descriptor.supportedArchitectures.includes(image.architecture)) {
    reasons.add(
      "architecture",
      "Architecture " + image.architecture + " is not supported.",
      { architecture: image.architecture },
    );
  }

  const kernelSection = sectionOf(image, "kernel");
  if (descriptor.requiresKernel && (!kernelSection || kernelSection.size === 0)) {
    reasons.add("no-kernel", "The image has no kernel section to patch.");
  } else if (descriptor.requiresKernel && kernelSection) {
    const kernelCompression = detectCompression(kernelSection.data);
    if (!isPayloadUsable(kernelCompression)) {
      const label = COMPRESSION_LABEL[kernelCompression];
      warnings.push({
        code: "unsupported-kernel-compression",
        message:
          "The kernel payload is " +
          label +
          ", which this build cannot expand; the kernel could not be patched safely.",
        severity: "warning",
        params: { compression: label },
      });
    }
  }

  const ramdisk = sectionOf(image, "ramdisk") ?? sectionOf(image, "vendor_ramdisk");
  if (descriptor.requiresRamdisk && !ramdisk) {
    reasons.add("no-ramdisk", "The image has no ramdisk section.");
  } else if (ramdisk) {
    const compression = detectCompression(ramdisk.data);
    if (!isPayloadUsable(compression)) {
      const label = COMPRESSION_LABEL[compression];
      warnings.push({
        code: "unsupported-compression",
        message:
          label +
          " ramdisk payloads cannot be expanded in this build; the compressed payload would be copied unchanged.",
        severity: "warning",
        params: { compression: label },
      });
    }
  }

  const releases = artifacts.releases(descriptor.id);
  if (releases.length === 0) {
    reasons.add("no-release", "No artifact release is registered for this provider.");
  }

  return {
    providerId: descriptor.id,
    name: descriptor.name,
    description: descriptor.description,
    status: descriptor.status,
    available,
    compatible: reasons.messages.length === 0,
    reasons: reasons.messages,
    reasonDetails: reasons.details,
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
