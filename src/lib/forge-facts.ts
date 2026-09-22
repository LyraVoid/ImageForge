import type { ImageForgeErrorJson, PatchPlan } from "@/core";
import { buildDiagnostics } from "./diagnostics";
import type { DiagnosticsReport } from "./diagnostics";
import { useForgeStore } from "@/stores/forge-store";
import type { ForgeOutput } from "@/stores/forge-store";
import type { AnalyzeResponse } from "@/workers/protocol";

/**
 * The facts a diagnostics report may contain. The store snapshot is narrowed here on purpose: the
 * run options (which can hold a superkey) and the image bytes never enter this shape, so a report
 * cannot carry them even by accident.
 */
export interface ForgeFacts {
  file: { name: string; size: number } | null;
  analysis: AnalyzeResponse | null;
  plan: PatchPlan | null;
  output: ForgeOutput | null;
  error: ImageForgeErrorJson | null;
}

export function forgeFactsFromStore(): ForgeFacts {
  const state = useForgeStore.getState();
  return {
    file: state.file === null ? null : { name: state.file.name, size: state.file.size },
    analysis: state.analysis,
    plan: state.planResponse?.plan ?? null,
    output: state.output,
    error: state.error,
  };
}

export function forgeDiagnostics(locale: string, facts: ForgeFacts): DiagnosticsReport {
  return buildDiagnostics({ ...facts, locale });
}
