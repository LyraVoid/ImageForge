import { APP_VERSION } from "./app-meta";
import type { ImageForgeErrorJson, PatchPlan } from "@/core";
import type { ForgeOutput } from "@/stores/forge-store";
import type { AnalyzeResponse } from "@/workers/protocol";

/**
 * What a bug report needs and nothing else. The report is built from the plan, the metadata and
 * the verification result, never from the run context: a superkey passed in `PatchOptions` is
 * deliberately absent, and no image byte is copied into it. A regression here would leak a secret
 * into a file the user is about to share, so `tests/unit/diagnostics.test.ts` asserts both.
 */
export interface DiagnosticsReport {
  tool: {
    name: "ImageForge";
    version: string;
    locale: string;
    userAgent: string;
    generatedAt: string;
  };
  image: { name: string; sizeBytes: number } | null;
  analysis: {
    sha256: string;
    crc32: string;
    summary: AnalyzeResponse["summary"];
    wasm: AnalyzeResponse["wasm"];
    compatibility: AnalyzeResponse["compatibility"];
    report: AnalyzeResponse["report"];
    existingPatch: string[];
  } | null;
  plan: PatchPlan | null;
  result: {
    sha256: string;
    sizeBytes: number;
    fileName: string;
    warnings: string[];
    metadata: Record<string, string>;
    verification: ForgeOutput["verification"];
  } | null;
  error: ImageForgeErrorJson | null;
}

export interface DiagnosticsInput {
  file: { name: string; size: number } | null;
  locale: string;
  analysis: AnalyzeResponse | null;
  plan: PatchPlan | null;
  output: ForgeOutput | null;
  error: ImageForgeErrorJson | null;
  generatedAt?: string;
  userAgent?: string;
  version?: string;
}

export function buildDiagnostics(input: DiagnosticsInput): DiagnosticsReport {
  return {
    tool: {
      name: "ImageForge",
      version: input.version ?? APP_VERSION,
      locale: input.locale,
      userAgent: input.userAgent ?? (typeof navigator === "undefined" ? "unknown" : navigator.userAgent),
      generatedAt: input.generatedAt ?? new Date().toISOString(),
    },
    image: input.file === null ? null : { name: input.file.name, sizeBytes: input.file.size },
    analysis:
      input.analysis === null
        ? null
        : {
            sha256: input.analysis.sha256,
            crc32: input.analysis.crc32,
            summary: input.analysis.summary,
            wasm: input.analysis.wasm,
            compatibility: input.analysis.compatibility,
            report: input.analysis.report,
            existingPatch: input.analysis.existingPatch ?? [],
          },
    plan: input.plan,
    result:
      input.output === null
        ? null
        : {
            sha256: input.output.sha256,
            sizeBytes: input.output.sizeBytes,
            fileName: input.output.fileName,
            warnings: input.output.warnings,
            metadata: input.output.metadata,
            verification: input.output.verification,
          },
    error: input.error,
  };
}

export function diagnosticsJson(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}

export function diagnosticsFileName(report: DiagnosticsReport, stamp: string): string {
  const base = report.image?.name.replace(/\.[^./]+$/, "") ?? "imageforge";
  return "diagnostics_" + base + "_" + stamp.replace(/[:.]/g, "-") + ".json";
}

/** Saves the report locally. Nothing is uploaded; the user decides where it goes. */
export function downloadDiagnostics(report: DiagnosticsReport, now: Date = new Date()): string {
  const fileName = diagnosticsFileName(report, now.toISOString());
  const blob = new Blob([diagnosticsJson(report)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
