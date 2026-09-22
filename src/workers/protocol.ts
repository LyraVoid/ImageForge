import type { ArtifactKind, DetectedArtifact, WorkspaceArtifact } from "../core/workspace";
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
  /** Patch programs that already left their marks in this image, read from the image itself. */
  existingPatch?: string[];
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

export interface PatchAttachmentPayload {
  id: string;
  name: string;
  bytes: ArrayBuffer;
}

export interface PatchRequest {
  providerId: string;
  options?: PatchOptions;
  /** Binary payloads such as KernelPatch modules, transferred to the worker. */
  attachments?: PatchAttachmentPayload[];
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

/** A file the user opened, as the workspace sees it. The bytes stay in the session. */
export interface WorkspaceSourceRecord {
  id: string;
  name: string;
  sizeBytes: number;
  kind: ArtifactKind;
  detected: DetectedArtifact;
}

export interface WorkspaceSnapshot {
  sources: WorkspaceSourceRecord[];
  artifacts: WorkspaceArtifact[];
}

export interface RegisterArtifactRequest {
  sourceId: string;
  parentId: string;
  tool: string;
  name: string;
  params?: Record<string, string>;
  bytes: ArrayBuffer;
}

export interface PatchWorkerApi {
  version(): Promise<string>;
  analyze(file: ArrayBuffer, name?: string): Promise<AnalyzeResponse>;
  plan(request: PlanRequest): Promise<PlanResponse>;
  patch(request: PatchRequest, onProgress?: ProgressSink): Promise<PatchResponse>;
  cancel(): Promise<void>;
  reset(): Promise<void>;
  /** Opens a file into the workspace and reports what it is. */
  openSource(file: ArrayBuffer, name?: string): Promise<WorkspaceSourceRecord>;
  /** Analyzes a source that is already open, which is how the patcher starts from the workspace. */
  analyzeSource(sourceId: string): Promise<AnalyzeResponse>;
  workspace(): Promise<WorkspaceSnapshot>;
  /** Reads a range of a source or an artifact, so a caller can look inside something big. */
  readArtifact(id: string, offset?: number, length?: number): Promise<ArrayBuffer>;
  registerArtifact(request: RegisterArtifactRequest): Promise<WorkspaceArtifact>;
  digestArtifact(id: string): Promise<string>;
  /** Closes a source and everything that was derived from it. */
  closeSource(sourceId: string): Promise<void>;
}
