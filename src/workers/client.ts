import * as Comlink from "comlink";
import type { PatchWorkerSession } from "./session";
import type { OpenedPackage } from "@/core/package";
import type { WorkspaceArtifact } from "@/core/workspace";
import type {
  AnalyzeResponse,
  AnimationPackRequest,
  AnimationSummary,
  DiffSummary,
  PatchRequest,
  PatchResponse,
  PatchWorkerApi,
  PlanRequest,
  PlanResponse,
  ProgressSink,
  FilesystemListing,
  PartitionView,
  RegisterArtifactRequest,
  SplashPreview,
  SplashReplacementRequest,
  SplashSummary,
  SuperPackRequest,
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
  extractPackageEntry(sourceId: string, entryId: string, options?: { stream?: boolean }): Promise<WorkspaceArtifact>;
  artifactBlob(id: string): Promise<Blob>;
  packSparseArtifact(artifactId: string, options?: { blockSize?: number }): Promise<WorkspaceArtifact>;
  packSuperImage(request: SuperPackRequest): Promise<WorkspaceArtifact>;
  compareWithArtifact(sourceId: string, inside: string | undefined, artifactId: string): Promise<DiffSummary>;
  inspectAnimation(sourceId: string, inside?: string): Promise<AnimationSummary>;
  readAnimationFrame(sourceId: string, inside: string | undefined, name: string): Promise<ArrayBuffer>;
  packAnimationArchive(
    sourceId: string,
    inside: string | undefined,
    request: AnimationPackRequest,
  ): Promise<WorkspaceArtifact>;
  analyzeArtifact(artifactId: string): Promise<AnalyzeResponse>;
  inspectPartition(sourceId: string, inside?: string): Promise<PartitionView>;
  unpackSparseSource(sourceId: string): Promise<WorkspaceArtifact>;
  extractLogicalPartition(
    sourceId: string,
    partitionName: string,
    options?: { stream?: boolean },
  ): Promise<WorkspaceArtifact>;
  inspectSplash(
    sourceId: string,
    inside?: string,
    resolution?: { width: number; height: number },
  ): Promise<SplashSummary>;
  readSplashFrameBmp(sourceId: string, inside: string | undefined, index: number): Promise<ArrayBuffer>;
  readSplashFramePreview(
    sourceId: string,
    inside: string | undefined,
    index: number,
    resolution?: { width: number; height: number },
  ): Promise<SplashPreview>;
  exportFilesAsZip(
    sourceId: string,
    name: string,
    files: { name: string; data: ArrayBuffer }[],
  ): Promise<WorkspaceArtifact>;
  packSplashImage(
    sourceId: string,
    inside: string | undefined,
    replacements: SplashReplacementRequest[],
    resolution?: { width: number; height: number },
  ): Promise<WorkspaceArtifact>;
  browseFilesystem(sourceId: string, path: string, inside?: string): Promise<FilesystemListing>;
  extractEntries(sourceId: string, entryIds: string[]): Promise<WorkspaceArtifact[]>;
  extractFilesystemFileAs(sourceId: string, path: string, inside?: string): Promise<WorkspaceArtifact>;
  openArtifactSource(artifactId: string): Promise<WorkspaceSourceRecord>;
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
    extractPackageEntry: (sourceId, entryId, options) => remote.extractPackageEntry(sourceId, entryId, options),
    artifactBlob: (id) => remote.artifactBlob(id),
    packSparseArtifact: (artifactId, options) => remote.packSparseArtifact(artifactId, options),
    packSuperImage: (request) => remote.packSuperImage(request),
    compareWithArtifact: (sourceId, inside, artifactId) =>
      remote.compareWithArtifact(sourceId, inside, artifactId),
    inspectAnimation: (sourceId, inside) => remote.inspectAnimation(sourceId, inside),
    readAnimationFrame: (sourceId, inside, name) => remote.readAnimationFrame(sourceId, inside, name),
    packAnimationArchive: (sourceId, inside, request) =>
      remote.packAnimationArchive(
        sourceId,
        inside,
        { ...request, replacements: request.replacements.map((entry) => Comlink.transfer(entry, [entry.data])) },
      ),
    analyzeArtifact: (artifactId) => remote.analyzeArtifact(artifactId),
    inspectPartition: (sourceId, inside) => remote.inspectPartition(sourceId, inside),
    unpackSparseSource: (sourceId) => remote.unpackSparseSource(sourceId),
    extractLogicalPartition: (sourceId, name, options) => remote.extractLogicalPartition(sourceId, name, options),
    inspectSplash: (sourceId, inside, resolution) => remote.inspectSplash(sourceId, inside, resolution),
    readSplashFrameBmp: (sourceId, inside, index) => remote.readSplashFrameBmp(sourceId, inside, index),
    readSplashFramePreview: (sourceId, inside, index, resolution) =>
      remote.readSplashFramePreview(sourceId, inside, index, resolution),
    exportFilesAsZip: (sourceId, name, files) =>
      remote.exportFilesAsZip(
        sourceId,
        name,
        files.map((file) => Comlink.transfer(file, [file.data])),
      ),
    packSplashImage: (sourceId, inside, replacements, resolution) =>
      remote.packSplashImage(
        sourceId,
        inside,
        replacements.map((entry) => Comlink.transfer(entry, [entry.payload])),
        resolution,
      ),
    browseFilesystem: (sourceId, path, inside) => remote.browseFilesystem(sourceId, path, inside),
    extractEntries: (sourceId, entryIds) => remote.extractEntries(sourceId, entryIds),
    extractFilesystemFileAs: (sourceId, path, inside) =>
      remote.extractFilesystemFileAs(sourceId, path, inside),
    openArtifactSource: (artifactId) => remote.openArtifactSource(artifactId),
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
    extractPackageEntry: async (sourceId, entryId, options) =>
      (await load()).extractPackageEntry(sourceId, entryId, options),
    artifactBlob: async (id) => (await load()).artifactBlob(id),
    packSparseArtifact: async (artifactId, options) =>
      (await load()).packSparseArtifact(artifactId, options),
    packSuperImage: async (request) => (await load()).packSuperImage(request),
    compareWithArtifact: async (sourceId, inside, artifactId) =>
      (await load()).compareWithArtifact(sourceId, inside, artifactId),
    inspectAnimation: async (sourceId, inside) => (await load()).inspectAnimation(sourceId, inside),
    readAnimationFrame: async (sourceId, inside, name) =>
      (await load()).readAnimationFrame(sourceId, inside, name),
    packAnimationArchive: async (sourceId, inside, request) =>
      (await load()).packAnimationArchive(sourceId, inside, request),
    analyzeArtifact: async (artifactId) => (await load()).analyzeArtifact(artifactId),
    inspectPartition: async (sourceId, inside) => (await load()).inspectPartition(sourceId, inside),
    unpackSparseSource: async (sourceId) => (await load()).unpackSparseSource(sourceId),
    extractLogicalPartition: async (sourceId, name, options) =>
      (await load()).extractLogicalPartition(sourceId, name, options),
    inspectSplash: async (sourceId, inside, resolution) =>
      (await load()).inspectSplash(sourceId, inside, resolution),
    readSplashFrameBmp: async (sourceId, inside, index) =>
      (await load()).readSplashFrameBmp(sourceId, inside, index),
    readSplashFramePreview: async (sourceId, inside, index, resolution) =>
      (await load()).readSplashFramePreview(sourceId, inside, index, resolution),
    exportFilesAsZip: async (sourceId, name, files) => (await load()).exportFilesAsZip(sourceId, name, files),
    packSplashImage: async (sourceId, inside, replacements, resolution) =>
      (await load()).packSplashImage(sourceId, inside, replacements, resolution),
    browseFilesystem: async (sourceId, path, inside) => (await load()).browseFilesystem(sourceId, path, inside),
    extractEntries: async (sourceId, entryIds) => (await load()).extractEntries(sourceId, entryIds),
    extractFilesystemFileAs: async (sourceId, path, inside) =>
      (await load()).extractFilesystemFileAs(sourceId, path, inside),
    openArtifactSource: async (artifactId) => (await load()).openArtifactSource(artifactId),
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
