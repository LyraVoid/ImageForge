import * as Comlink from "comlink";
import { createPatchWorkerSession } from "./session";
import type {
  AnalyzeResponse,
  PatchRequest,
  PatchResponse,
  PatchWorkerApi,
  PlanRequest,
  PlanResponse,
  ProgressSink,
} from "./protocol";

export type WorkerMode = "worker" | "inline";

export interface PatchWorkerClient {
  readonly mode: WorkerMode;
  version(): Promise<string>;
  analyze(file: ArrayBuffer, name?: string): Promise<AnalyzeResponse>;
  plan(request: PlanRequest): Promise<PlanResponse>;
  patch(request: PatchRequest, onProgress?: ProgressSink): Promise<PatchResponse>;
  cancel(): Promise<void>;
  reset(): Promise<void>;
  terminate(): void;
}

function createWorkerBackedClient(worker: Worker): PatchWorkerClient {
  const remote = Comlink.wrap<PatchWorkerApi>(worker);
  return {
    mode: "worker",
    version: () => remote.version(),
    analyze: (file, name) => remote.analyze(Comlink.transfer(file, [file]), name),
    plan: (request) => remote.plan(request),
    patch: (request, onProgress) => {
      const buffers = (request.attachments ?? []).map((attachment) => attachment.bytes);
      return remote.patch(
        Comlink.transfer(request, buffers),
        onProgress ? Comlink.proxy(onProgress) : undefined,
      );
    },
    cancel: () => remote.cancel(),
    reset: () => remote.reset(),
    terminate: () => worker.terminate(),
  };
}

function createInlineClient(): PatchWorkerClient {
  const session = createPatchWorkerSession();
  return {
    mode: "inline",
    version: () => session.version(),
    analyze: (file, name) => session.analyze(file, name),
    plan: (request) => session.plan(request),
    patch: (request, onProgress) => session.patch(request, onProgress),
    cancel: () => session.cancel(),
    reset: () => session.reset(),
    terminate: () => {
      void session.reset();
    },
  };
}

export function createPatchWorkerClient(): PatchWorkerClient {
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("./patch.worker.ts", import.meta.url), { type: "module" });
      return createWorkerBackedClient(worker);
    } catch {
      // fall through to the inline session
    }
  }
  return createInlineClient();
}
