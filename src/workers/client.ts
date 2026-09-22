import * as Comlink from "comlink";
import type { PatchWorkerSession } from "./session";
import type { OpenedPackage } from "@/core/package";
import type { WorkspaceArtifact } from "@/core/workspace";
import type {
  AnalyzeResponse,
  PatchRequest,
  PatchResponse,
  PatchWorkerApi,
  PlanRequest,
  PlanResponse,
  ProgressSink,
  FilesystemListing,
  PartitionView,
  RegisterArtifactRequest,
  WorkspaceSnapshot,
  WorkspaceSourceRecord,
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
  /** Opens a file into the workspace and reports what it is. A Blob is kept as a handle. */
  openSource(file: ArrayBuffer | Blob, name?: string): Promise<WorkspaceSourceRecord>;
  analyzeSource(sourceId: string): Promise<AnalyzeResponse>;
  workspace(): Promise<WorkspaceSnapshot>;
  readArtifact(id: string, offset?: number, length?: number): Promise<ArrayBuffer>;
  registerArtifact(request: RegisterArtifactRequest): Promise<WorkspaceArtifact>;
  digestArtifact(id: string): Promise<string>;
  listPackage(sourceId: string): Promise<OpenedPackage>;
  extractPackageEntry(sourceId: string, entryId: string): Promise<WorkspaceArtifact>;
  analyzeArtifact(artifactId: string): Promise<AnalyzeResponse>;
  inspectPartition(sourceId: string, inside?: string): Promise<PartitionView>;
  unpackSparseSource(sourceId: string): Promise<WorkspaceArtifact>;
  extractLogicalPartition(sourceId: string, partitionName: string): Promise<WorkspaceArtifact>;
  browseFilesystem(sourceId: string, path: string, inside?: string): Promise<FilesystemListing>;
  readFilesystemFile(sourceId: string, path: string, inside?: string): Promise<Uint8Array>;
  closeSource(sourceId: string): Promise<void>;
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
    // A Blob is a handle to a file on disk: it is cloned, never copied through the boundary.
    openSource: (file, name) =>
      file instanceof ArrayBuffer
        ? remote.openSource(Comlink.transfer(file, [file]), name)
        : remote.openSource(file, name),
    analyzeSource: (sourceId) => remote.analyzeSource(sourceId),
    workspace: () => remote.workspace(),
    readArtifact: (id, offset, length) => remote.readArtifact(id, offset, length),
    registerArtifact: (request) =>
      remote.registerArtifact(Comlink.transfer(request, [request.bytes])),
    digestArtifact: (id) => remote.digestArtifact(id),
    listPackage: (sourceId) => remote.listPackage(sourceId),
    extractPackageEntry: (sourceId, entryId) => remote.extractPackageEntry(sourceId, entryId),
    analyzeArtifact: (artifactId) => remote.analyzeArtifact(artifactId),
    inspectPartition: (sourceId, inside) => remote.inspectPartition(sourceId, inside),
    unpackSparseSource: (sourceId) => remote.unpackSparseSource(sourceId),
    extractLogicalPartition: (sourceId, name) => remote.extractLogicalPartition(sourceId, name),
    browseFilesystem: (sourceId, path, inside) => remote.browseFilesystem(sourceId, path, inside),
    readFilesystemFile: (sourceId, path, inside) => remote.readFilesystemFile(sourceId, path, inside),
    closeSource: (sourceId) => remote.closeSource(sourceId),
    terminate: () => worker.terminate(),
  };
}

/**
 * The inline session is imported on first use. It pulls in the Image Engine, the Patch Engine and
 * (through the registry) the providers, so a browser that does have a Worker must not pay for it
 * just because it is the fallback.
 */
function createInlineClient(): PatchWorkerClient {
  let session: PatchWorkerSession | null = null;
  const load = async (): Promise<PatchWorkerSession> => {
    if (!session) {
      const module = await import("./session");
      session = module.createPatchWorkerSession();
    }
    return session;
  };
  return {
    mode: "inline",
    version: async () => (await load()).version(),
    analyze: async (file, name) => (await load()).analyze(file, name),
    plan: async (request) => (await load()).plan(request),
    patch: async (request, onProgress) => (await load()).patch(request, onProgress),
    cancel: async () => {
      if (session) await session.cancel();
    },
    reset: async () => {
      if (session) await session.reset();
    },
    openSource: async (file, name) => (await load()).openSource(file, name),
    analyzeSource: async (sourceId) => (await load()).analyzeSource(sourceId),
    workspace: async () => (await load()).workspace(),
    readArtifact: async (id, offset, length) => (await load()).readArtifact(id, offset, length),
    registerArtifact: async (request) => (await load()).registerArtifact(request),
    digestArtifact: async (id) => (await load()).digestArtifact(id),
    listPackage: async (sourceId) => (await load()).listPackage(sourceId),
    extractPackageEntry: async (sourceId, entryId) => (await load()).extractPackageEntry(sourceId, entryId),
    analyzeArtifact: async (artifactId) => (await load()).analyzeArtifact(artifactId),
    inspectPartition: async (sourceId, inside) => (await load()).inspectPartition(sourceId, inside),
    unpackSparseSource: async (sourceId) => (await load()).unpackSparseSource(sourceId),
    extractLogicalPartition: async (sourceId, name) => (await load()).extractLogicalPartition(sourceId, name),
    browseFilesystem: async (sourceId, path, inside) => (await load()).browseFilesystem(sourceId, path, inside),
    readFilesystemFile: async (sourceId, path, inside) => (await load()).readFilesystemFile(sourceId, path, inside),
    closeSource: async (sourceId) => {
      if (session) await session.closeSource(sourceId);
    },
    terminate: () => {
      if (session) void session.reset();
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
