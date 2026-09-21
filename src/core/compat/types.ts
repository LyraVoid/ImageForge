import type { PatchProviderDescriptor } from "../patch/types";

export interface CompatibilityWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface PatchCandidate {
  providerId: string;
  name: string;
  description: string;
  status: PatchProviderDescriptor["status"];
  available: boolean;
  compatible: boolean;
  reasons: string[];
  warnings: CompatibilityWarning[];
}

export interface CompatibilityResult {
  compatible: boolean;
  warnings: string[];
  errors: string[];
  candidates: PatchCandidate[];
}
