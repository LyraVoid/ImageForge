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
  extractPackageEntry: (sourceId: string, entryId: string) =>
    session.extractPackageEntry(sourceId, entryId),
  analyzeArtifact: (artifactId: string) => session.analyzeArtifact(artifactId),
  inspectPartition: (sourceId: string, inside?: string) => session.inspectPartition(sourceId, inside),
  unpackSparseSource: (sourceId: string) => session.unpackSparseSource(sourceId),
  extractLogicalPartition: (sourceId: string, partitionName: string) =>
    session.extractLogicalPartition(sourceId, partitionName),
  browseFilesystem: (sourceId: string, path: string, inside?: string) =>
    session.browseFilesystem(sourceId, path, inside),
  readFilesystemFile: (sourceId: string, path: string, inside?: string) =>
    session.readFilesystemFile(sourceId, path, inside),
  closeSource: (sourceId: string) => session.closeSource(sourceId),
});
