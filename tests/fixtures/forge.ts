import type { PatchPlan, PatchVerificationResult } from "@/core";
import type { AnalyzeResponse } from "@/workers/protocol";
import type { ForgeOutput } from "@/stores/forge-store";

const artifact = { id: "kpimg", version: "0.13.8", type: "core-image", sha256: "d".repeat(64), source: "bundled:/artifacts/apatch/kpimg" };

export function fakePlan(overrides: Partial<PatchPlan> = {}): PatchPlan {
  return {
    id: "1".repeat(32),
    providerId: "apatch",
    providerName: "APatch",
    release: "11224",
    artifact,
    architecture: "arm64",
    target: "boot",
    headerVersion: 4,
    pageSize: 4096,
    sourceImageSha256: "a".repeat(64),
    configuration: { requiredManager: "me.bmax.apatch", superkeyMode: "none" },
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    reproducible: true,
    notes: [],
    ...overrides,
  };
}

export function fakeVerification(valid = true): PatchVerificationResult {
  const checks = [
    { id: "structure", label: "Image structure valid", status: "pass" as const, detail: "boot header v4" },
    { id: "kernel-hash", label: "Kernel SHA-256 matches the patch plan", status: valid ? ("pass" as const) : ("fail" as const) },
  ];
  return {
    verification: { valid, checks, sha256: "b".repeat(64), format: "boot", warnings: [] },
    artifactSha256: "d".repeat(64),
    checks,
  };
}

export function fakeOutput(overrides: Partial<ForgeOutput> = {}): ForgeOutput {
  return {
    plan: fakePlan(),
    sha256: "b".repeat(64),
    sizeBytes: 12_345_678,
    warnings: ["APatch patches the kernel only; flashing this image is the user's responsibility and ImageForge never flashes devices."],
    metadata: {
      provider: "apatch",
      requiredManager: "me.bmax.apatch",
      superkeyMode: "none",
      kernelSizeBefore: "1234",
      kernelSizeAfter: "2345",
      keepSignature: "false",
      preserveImageSize: "false",
    },
    verification: fakeVerification(),
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" }),
    fileName: "patched_boot.img",
    ...overrides,
  };
}

export function fakeAnalysis(): AnalyzeResponse {
  return {
    summary: {
      format: "boot",
      headerVersion: 4,
      pageSize: 4096,
      headerSize: 1584,
      architecture: "arm64",
      osVersion: "16.0.0",
      cmdline: "console=ttyMSM0",
      name: "boot",
      header: {} as AnalyzeResponse["summary"]["header"],
      sections: [],
      totalSize: 4096,
      warnings: [],
    },
    report: { groups: [], technical: { id: "technical", title: "Technical details", fields: [] }, compression: "LZ4 (legacy)", architecture: "arm64", sectionSummary: [] },
    compatibility: { compatible: true, warnings: [], errors: [], candidates: [] },
    sha256: "c".repeat(64),
    crc32: "00000000",
    providers: [],
    wasm: { available: true, path: "/wasm/imageforge.wasm", version: "0.1.0" },
  };
}
