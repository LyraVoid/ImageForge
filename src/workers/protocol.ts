import type {
  BootImageHeaderFields,
  CompatibilityResult,
  ImageFormat,
  ImageReport,
  PatchOptions,
  PatchPlan,
  PatchProgressEvent,
  PatchProviderDescriptor,
  PatchVerificationResult,
  VendorBootHeaderFields,
} from "../core";
import type { WasmStatus } from "../wasm/abi";

export interface SectionSummary {
  name: string;
  offset: number;
  size: number;
}

export interface ImageSummary {
  format: ImageFormat;
  headerVersion: number;
  pageSize: number;
  headerSize: number;
  architecture: string | null;
  osVersion: string;
  cmdline: string;
  name: string;
  header: BootImageHeaderFields | VendorBootHeaderFields;
  sections: SectionSummary[];
  totalSize: number;
  warnings: string[];
}

export interface AnalyzeResponse {
  summary: ImageSummary;
  report: ImageReport;
  compatibility: CompatibilityResult;
  sha256: string;
  crc32: string;
  providers: PatchProviderDescriptor[];
  wasm: WasmStatus;
}

export interface PlanRequest {
  providerId: string;
  options?: PatchOptions;
}

export interface PlanResponse {
  plan: PatchPlan;
  providerNotes: string[];
}

export interface PatchRequest {
  providerId: string;
  options?: PatchOptions;
}

export interface PatchResponse {
  plan: PatchPlan;
  sha256: string;
  sizeBytes: number;
  warnings: string[];
  metadata: Record<string, string>;
  verification: PatchVerificationResult;
  bytes: ArrayBuffer;
}

export type ProgressSink = (event: PatchProgressEvent) => void;

export interface PatchWorkerApi {
  version(): Promise<string>;
  analyze(file: ArrayBuffer, name?: string): Promise<AnalyzeResponse>;
  plan(request: PlanRequest): Promise<PlanResponse>;
  patch(request: PatchRequest, onProgress?: ProgressSink): Promise<PatchResponse>;
  cancel(): Promise<void>;
  reset(): Promise<void>;
}
