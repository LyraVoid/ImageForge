import type { PatchProviderDescriptor } from "../patch/types";

/** A verdict the interface can word itself: the code is stable, the message is the source text. */
export interface CompatibilityReason {
  code: string;
  params?: Record<string, string>;
}

export interface CompatibilityWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  params?: Record<string, string>;
}

export interface PatchCandidate {
  providerId: string;
  name: string;
  description: string;
  status: PatchProviderDescriptor["status"];
  available: boolean;
  compatible: boolean;
  /** Source sentences, kept for the plan's technical detail and for logs. */
  reasons: string[];
  /** The same reasons as codes, one entry per sentence and in the same order. */
  reasonDetails: CompatibilityReason[];
  warnings: CompatibilityWarning[];
}

export interface CompatibilityResult {
  compatible: boolean;
  warnings: string[];
  errors: string[];
  candidates: PatchCandidate[];
}
