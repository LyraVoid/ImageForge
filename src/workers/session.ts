import { WorkerError } from "../core/errors";
import { sha256Hex } from "../core/hash";
import { parseImage } from "../core/image";
import type { ParsedImage } from "../core/image";
import { buildImageReport } from "../core/image/report";
import { createPatchEngine } from "../core/patch/engine";
import type { PatchEngine } from "../core/patch/engine";
import {
  addArtifact,
  addSource,
  detectArtifact,
  emptyWorkspace,
  derivedArtifactId,
  removeSource,
} from "../core/workspace";
import type { Workspace, WorkspaceArtifact } from "../core/workspace";
import { loadWasmModule } from "../wasm/loader";
import type {
  AnalyzeResponse,
  ImageSummary,
  PatchRequest,
  PatchResponse,
  PatchWorkerApi,
  PlanRequest,
  PlanResponse,
  ProgressSink,
  RegisterArtifactRequest,
  WorkspaceSnapshot,
  WorkspaceSourceRecord,
} from "./protocol";

export const PATCH_WORKER_VERSION = "1.0.0";

interface SessionState {
  sourceId: string;
  bytes: Uint8Array;
  image: ParsedImage;
  sha256: string;
  name: string;
}

interface HeldSource {
  record: WorkspaceSourceRecord;
  bytes: Uint8Array;
}

interface HeldArtifact {
  record: WorkspaceArtifact;
  bytes: Uint8Array;
}

export function toImageSummary(image: ParsedImage): ImageSummary {
  return {
    format: image.format,
    headerVersion: image.headerVersion,
    pageSize: image.pageSize,
    headerSize: image.headerSize,
    architecture: image.architecture,
    osVersion: image.osVersion,
    cmdline: image.cmdline,
    name: image.name,
    header: image.header,
    sections: image.sections.map((section) => ({
      name: section.name,
      offset: section.offset,
      size: section.size,
    })),
    totalSize: image.totalSize,
    warnings: [...image.warnings],
  };
}

export class PatchWorkerSession implements PatchWorkerApi {
  private readonly engine: PatchEngine;
  private state: SessionState | null = null;
  private controller: AbortController | null = null;
  /** The workspace is metadata plus bytes; nothing here is ever sent to the main thread unasked. */
  private workspaceState: Workspace = emptyWorkspace();
  private readonly sources = new Map<string, HeldSource>();
  private readonly artifacts = new Map<string, HeldArtifact>();
  private nextSourceId = 1;

  constructor(engine: PatchEngine = createPatchEngine()) {
    this.engine = engine;
  }

  async version(): Promise<string> {
    return PATCH_WORKER_VERSION;
  }

  async openSource(file: ArrayBuffer, name = "image"): Promise<WorkspaceSourceRecord> {
    const bytes = new Uint8Array(file);
    if (bytes.length === 0) {
      throw new WorkerError("The opened file is empty.", "Choose a file that is not empty.");
    }
    const record: WorkspaceSourceRecord = {
      id: "source-" + String(this.nextSourceId),
      name,
      sizeBytes: bytes.length,
      kind: detectArtifact(bytes).kind,
      detected: detectArtifact(bytes),
    };
    this.nextSourceId += 1;
    this.sources.set(record.id, { record, bytes });
    this.workspaceState = addSource(this.workspaceState, record);
    return record;
  }

  async analyzeSource(sourceId: string): Promise<AnalyzeResponse> {
    const source = this.requireSource(sourceId);
    const bytes = source.bytes;
    const wasm = await loadWasmModule();
    const image = parseImage(bytes);
    const sha256 = await sha256Hex(bytes);

    this.state = { sourceId, bytes, image, sha256, name: source.record.name };
    this.controller = null;

    const report = await buildImageReport(image, {
      sourceName: source.record.name,
      sourceSize: bytes.length,
    });
    return {
      summary: toImageSummary(image),
      ...(report.existingPatch === undefined ? {} : { existingPatch: report.existingPatch }),
      report,
      compatibility: this.engine.compatibility(image),
      sha256,
      crc32: wasm.crc32(bytes).toString(16).padStart(8, "0"),
      providers: this.engine.providers.descriptors(),
      wasm: wasm.status,
    };
  }

  async analyze(file: ArrayBuffer, name = "image"): Promise<AnalyzeResponse> {
    const source = await this.openSource(file, name);
    return this.analyzeSource(source.id);
  }

  async workspace(): Promise<WorkspaceSnapshot> {
    return {
      sources: this.workspaceState.sources.map((source) => ({ ...source })),
      artifacts: this.workspaceState.artifacts.map((artifact) => ({ ...artifact })),
    };
  }

  async readArtifact(id: string, offset = 0, length?: number): Promise<ArrayBuffer> {
    const bytes = this.bytesOf(id);
    const start = Math.max(0, Math.min(offset, bytes.length));
    const end = length === undefined ? bytes.length : Math.max(start, Math.min(start + length, bytes.length));
    return toStandaloneBuffer(bytes.subarray(start, end));
  }

  async registerArtifact(request: RegisterArtifactRequest): Promise<WorkspaceArtifact> {
    const source = this.requireSource(request.sourceId);
    if (request.parentId !== request.sourceId && !this.artifacts.has(request.parentId)) {
      throw new WorkerError(
        "Artifact " + request.parentId + " is not in this workspace.",
        "Open the file it was derived from before registering it.",
      );
    }
    const bytes = new Uint8Array(request.bytes);
    const detected = detectArtifact(bytes);
    const record: WorkspaceArtifact = {
      id: derivedArtifactId(request.sourceId, request.tool, request.name),
      sourceId: source.record.id,
      parentId: request.parentId,
      tool: request.tool,
      params: request.params ?? {},
      name: request.name,
      sizeBytes: bytes.length,
      kind: detected.kind,
      detected,
    };
    this.artifacts.set(record.id, { record, bytes });
    this.workspaceState = addArtifact(this.workspaceState, record);
    return record;
  }

  async digestArtifact(id: string): Promise<string> {
    return sha256Hex(this.bytesOf(id));
  }

  async closeSource(sourceId: string): Promise<void> {
    this.requireSource(sourceId);
    for (const artifact of this.workspaceState.artifacts) {
      if (artifact.sourceId === sourceId) this.artifacts.delete(artifact.id);
    }
    this.sources.delete(sourceId);
    this.workspaceState = removeSource(this.workspaceState, sourceId);
    if (this.state?.sourceId === sourceId) this.state = null;
  }

  private requireSource(sourceId: string): HeldSource {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new WorkerError("Source " + sourceId + " is not open.", "Open the file again.");
    }
    return source;
  }

  private bytesOf(id: string): Uint8Array {
    const source = this.sources.get(id);
    if (source) return source.bytes;
    const artifact = this.artifacts.get(id);
    if (artifact) return artifact.bytes;
    throw new WorkerError("Nothing in the workspace has the id " + id + ".", "Open the file again.");
  }

  async plan(request: PlanRequest): Promise<PlanResponse> {
    const state = this.requireState();
    const options = request.options ?? {};
    const plan = await this.engine.plan({
      image: state.image,
      sourceImageSha256: state.sha256,
      providerId: request.providerId,
      options,
    });
    const provider = this.engine.providers.get(request.providerId);
    const analysis = provider ? await provider.analyze(state.image) : null;
    return { plan, providerNotes: analysis ? analysis.notes : [] };
  }

  async patch(request: PatchRequest, onProgress?: ProgressSink): Promise<PatchResponse> {
    const state = this.requireState();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const attachments = (request.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        bytes: new Uint8Array(attachment.bytes),
      }));
      const outcome = await this.engine.run(
        state.image,
        state.sha256,
        request.providerId,
        request.options ?? {},
        { onProgress, signal: controller.signal, attachments },
      );
      return {
        plan: outcome.plan,
        sha256: outcome.result.sha256,
        sizeBytes: outcome.result.sizeBytes,
        warnings: outcome.result.warnings,
        metadata: outcome.result.metadata,
        verification: outcome.verification,
        bytes: toStandaloneBuffer(outcome.result.bytes),
      };
    } finally {
      this.controller = null;
    }
  }

  async cancel(): Promise<void> {
    this.controller?.abort();
  }

  async reset(): Promise<void> {
    this.controller?.abort();
    this.controller = null;
    this.state = null;
    // One reset for the whole session: the workspace is what the patcher reads its image from.
    this.workspaceState = emptyWorkspace();
    this.sources.clear();
    this.artifacts.clear();
    this.nextSourceId = 1;
  }

  private requireState(): SessionState {
    if (!this.state) {
      throw new WorkerError("No image is loaded in the patch worker.", "Analyze an image before planning a patch.");
    }
    return this.state;
  }
}

function toStandaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export function createPatchWorkerSession(engine?: PatchEngine): PatchWorkerSession {
  return new PatchWorkerSession(engine);
}
