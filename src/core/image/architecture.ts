import { readUint32LE, startsWith } from "../binary";

export const ARM64_KERNEL_MAGIC = 0x644d5241;
export const ARM32_ZIMAGE_MAGIC = 0x016f2818;

export interface ArchitectureGuess {
  architecture: string | null;
  confidence: "high" | "medium" | "none";
  reason: string;
}

export function detectKernelArchitecture(kernel: Uint8Array | undefined): ArchitectureGuess {
  if (!kernel || kernel.length < 64) {
    return { architecture: null, confidence: "none", reason: "No kernel payload available." };
  }
  if (kernel.length >= 0x204 && startsWith(kernel.subarray(0x202, 0x206), [0x48, 0x64, 0x72, 0x53])) {
    return { architecture: "x86_64", confidence: "high", reason: "Kernel header signature HdrS." };
  }
  if (kernel.length >= 60 && readUint32LE(kernel, 56) === ARM64_KERNEL_MAGIC) {
    return { architecture: "arm64", confidence: "high", reason: "ARM64 Image magic at offset 56." };
  }
  if (kernel.length >= 40 && readUint32LE(kernel, 36) === ARM32_ZIMAGE_MAGIC) {
    return { architecture: "arm", confidence: "high", reason: "ARM32 zImage magic at offset 36." };
  }
  return {
    architecture: null,
    confidence: "none",
    reason: "Kernel is compressed or uses an unrecognized container.",
  };
}

export function decodeOsVersion(raw: number): string {
  if (raw === 0) return "unspecified";
  const major = (raw >> 14) & 0x7f;
  const minor = (raw >> 7) & 0x7f;
  const patch = raw & 0x7f;
  return major + "." + minor + "." + patch;
}
