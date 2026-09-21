import type { ImageVerification, ImageFormat, ParsedImage } from "../image";
import type { PatchArtifact } from "../artifacts/types";

export type PatchStage = "analyze" | "extract" | "prepare" | "patch" | "repack" | "verify" | "complete";

export interface PatchProgressEvent {
  stage: PatchStage;
  progress: number;
  message?: string;
}

/** A binary payload the caller hands to a provider for this run only. */
export interface PatchAttachment {
  id: string;
  name: string;
  bytes: Uint8Array;
}

export interface PatchRunContext {
  onProgress?: (event: PatchProgressEvent) => void;
  signal?: AbortSignal;
  /** Extra payloads such as KernelPatch modules, never part of the plan. */
  attachments?: PatchAttachment[];
  /**
   * Options the caller passed for this run. Providers read settings that must not be
   * persisted in the plan (such as a superkey) from here.
   */
  options?: PatchOptions;
}

export interface PatchAnalysis {
  providerId: string;
  summary: string;
  supportedTargets: ImageFormat[];
  notes: string[];
}

export interface PatchOptions {
  release?: string;
  artifactId?: string;
  architecture?: string;
  configuration?: Record<string, string>;
}

export interface PatchPlanStep {
  id: string;
  label: string;
  progress: number;
}

export interface PatchPlan {
  id: string;
  providerId: string;
  providerName: string;
  release: string;
  artifact: PatchArtifact;
  architecture: string;
  target: ImageFormat;
  headerVersion: number;
  pageSize: number;
  sourceImageSha256: string;
  configuration: Record<string, string>;
  steps: PatchPlanStep[];
  createdAt: string;
  reproducible: boolean;
  notes: string[];
}

export interface PatchResult {
  plan: PatchPlan;
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
  warnings: string[];
  metadata: Record<string, string>;
}

export interface PatchVerificationResult {
  verification: ImageVerification;
  artifactSha256: string | undefined;
  checks: ImageVerification["checks"];
}

/**
 * What a run will carry, passed to the provider while planning. A plan has to pin exactly the
 * payloads that will be embedded, otherwise the run and the plan disagree.
 */
export interface PatchPlanContext {
  attachmentNames?: string[];
}

export interface PatchProvider {
  id: string;
  name: string;
  analyze(image: ParsedImage, context?: PatchRunContext): Promise<PatchAnalysis>;
  resolve(
    image: ParsedImage,
    options: PatchOptions,
    sourceImageSha256: string,
    context?: PatchPlanContext,
  ): Promise<PatchPlan>;
  patch(image: ParsedImage, plan: PatchPlan, context: PatchRunContext): Promise<PatchResult>;
  verify(result: PatchResult, context?: PatchRunContext): Promise<PatchVerificationResult>;
}

export interface PatchProviderDescriptor {
  id: string;
  name: string;
  description: string;
  status: "available" | "planned";
  website?: string;
  notes: string[];
  supportedFormats: ImageFormat[];
  supportedHeaderVersions: number[];
  supportedArchitectures: string[];
  requiresKernel: boolean;
  requiresRamdisk: boolean;
}
