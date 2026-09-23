import * as Comlink from "comlink";
import { createPatchWorkerSession } from "./session";

const session = createPatchWorkerSession();

Comlink.expose({
  version: () => session.version(),
  analyze: (file: ArrayBuffer, name?: string) => session.analyze(file, name),
  plan: (request: Parameters<typeof session.plan>[0]) => session.plan(request),
  patch: (request: Parameters<typeof session.patch>[0], onProgress?: Parameters<typeof session.patch>[1]) =>
    session.patch(request, onProgress),
  cancel: () => session.cancel(),
  reset: () => session.reset(),
  openSource: (file: ArrayBuffer | Blob, name?: string) => session.openSource(file, name),
  analyzeSource: (sourceId: string) => session.analyzeSource(sourceId),
  workspace: () => session.workspace(),
  readArtifact: (id: string, offset?: number, length?: number) => session.readArtifact(id, offset, length),
  registerArtifact: (request: Parameters<typeof session.registerArtifact>[0]) => session.registerArtifact(request),
  digestArtifact: (id: string) => session.digestArtifact(id),
  listPackage: (sourceId: string) => session.listPackage(sourceId),
  extractPackageEntry: (sourceId: string, entryId: string, options?: { stream?: boolean }) =>
    session.extractPackageEntry(sourceId, entryId, options),
  artifactBlob: (id: string) => session.artifactBlob(id),
  packSparseArtifact: (artifactId: string, options?: { blockSize?: number }) =>
    session.packSparseArtifact(artifactId, options),
  analyzeArtifact: (artifactId: string) => session.analyzeArtifact(artifactId),
  inspectPartition: (sourceId: string, inside?: string) => session.inspectPartition(sourceId, inside),
  unpackSparseSource: (sourceId: string) => session.unpackSparseSource(sourceId),
  extractLogicalPartition: (sourceId: string, partitionName: string, options?: { stream?: boolean }) =>
    session.extractLogicalPartition(sourceId, partitionName, options),
  inspectSplash: (sourceId: string, inside?: string, resolution?: { width: number; height: number }) =>
    session.inspectSplash(sourceId, inside, resolution),
  readSplashFrameBmp: (sourceId: string, inside: string | undefined, index: number) =>
    session.readSplashFrameBmp(sourceId, inside, index),
  readSplashFramePreview: (
    sourceId: string,
    inside: string | undefined,
    index: number,
    resolution?: { width: number; height: number },
  ) => session.readSplashFramePreview(sourceId, inside, index, resolution),
  exportFilesAsZip: (
    sourceId: string,
    name: string,
    files: { name: string; data: ArrayBuffer }[],
  ) => session.exportFilesAsZip(sourceId, name, files),
  packSplashImage: (
    sourceId: string,
    inside: string | undefined,
    replacements: Parameters<typeof session.packSplashImage>[2],
    resolution?: { width: number; height: number },
  ) => session.packSplashImage(sourceId, inside, replacements, resolution),
  browseFilesystem: (sourceId: string, path: string, inside?: string) =>
    session.browseFilesystem(sourceId, path, inside),
  readFilesystemFile: (sourceId: string, path: string, inside?: string) =>
    session.readFilesystemFile(sourceId, path, inside),
  closeSource: (sourceId: string) => session.closeSource(sourceId),
});
