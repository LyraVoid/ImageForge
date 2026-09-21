import { WorkerError } from "../core/errors";
import { sha256Hex } from "../core/hash";
import { parseImage } from "../core/image";
import type { ParsedImage } from "../core/image";
import { buildImageReport } from "../core/image/report";
import { createPatchEngine } from "../core/patch/engine";
import type { PatchEngine } from "../core/patch/engine";
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
} from "./protocol";

export const PATCH_WORKER_VERSION = "1.0.0";

interface SessionState {
  bytes: Uint8Array;
  image: ParsedImage;
  sha256: string;
  name: string;
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

  constructor(engine: PatchEngine = createPatchEngine()) {
    this.engine = engine;
  }

  async version(): Promise<string> {
    return PATCH_WORKER_VERSION;
  }

  async analyze(file: ArrayBuffer, name = "image"): Promise<AnalyzeResponse> {
    const bytes = new Uint8Array(file);
    const wasm = await loadWasmModule();
    const image = parseImage(bytes);
    const sha256 = await sha256Hex(bytes);

    this.state = { bytes, image, sha256, name };
    this.controller = null;

    const report = await buildImageReport(image, { sourceName: name, sourceSize: bytes.length });
    return {
      summary: toImageSummary(image),
      report,
      compatibility: this.engine.compatibility(image),
      sha256,
      crc32: wasm.crc32(bytes).toString(16).padStart(8, "0"),
      providers: this.engine.providers.descriptors(),
      wasm: wasm.status,
    };
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
      const outcome = await this.engine.run(
        state.image,
        state.sha256,
        request.providerId,
        request.options ?? {},
        { onProgress, signal: controller.signal },
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
