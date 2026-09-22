import { WorkerError } from "../core/errors";
import { sha256Hex } from "../core/hash";
import { parseImage } from "../core/image";
import type { ParsedImage } from "../core/image";
import { buildImageReport } from "../core/image/report";
import { createPatchEngine } from "../core/patch/engine";
import type { PatchEngine } from "../core/patch/engine";
import {
  blobSource,
  bytesSource,
  extractPackageEntry as extractEntryFrom,
  openPackage,
  readAll,
  readPrefix,
} from "../core/package";
import type { ByteSource, OpenedPackage } from "../core/package";
import {
  LP_METADATA_GEOMETRY_MAGIC,
  checkExt4Supported,
  listExt4Directory,
  logicalPartitionSource,
  parseErofs,
  parseExt4,
  parseSparse,
  parseSuper,
  readDirectory,
  readExt4File,
  readExt4Inode,
  readInode,
  readInodeData,
  resolveErofsPath,
  resolveExt4Path,
  unpackSparse,
} from "../core/partition";
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
  PartitionView,
  ProgressSink,
  RegisterArtifactRequest,
  WorkspaceSnapshot,
  WorkspaceSourceRecord,
  FilesystemListing,
} from "./protocol";

export const PATCH_WORKER_VERSION = "1.0.0";

/** Analyzing an image means parsing and hashing it, so it has to fit in memory. */
const MAX_ANALYZABLE_BYTES = 512 * 1024 * 1024;

interface SessionState {
  sourceId: string;
  bytes: Uint8Array;
  image: ParsedImage;
  sha256: string;
  name: string;
}

interface HeldSource {
  record: WorkspaceSourceRecord;
  /** Ranged access to the file the user opened. An 8 GiB package stays on disk. */
  source: ByteSource;
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

  /**
   * Opens a file into the workspace. A `Blob` (what a file input hands over) is kept as a handle and
   * read in ranges; bytes are accepted too, which is what the tests and the inline path use.
   */
  async openSource(file: ArrayBuffer | Blob, name = "image"): Promise<WorkspaceSourceRecord> {
    const source = file instanceof Blob ? blobSource(file) : bytesSource(new Uint8Array(file));
    if (source.size === 0) {
      throw new WorkerError("The opened file is empty.", "Choose a file that is not empty.");
    }
    // Detection only ever needs a prefix: headers, magics and filesystem superblocks live there.
    const detected = detectArtifact(await readPrefix(source, 8192));
    const record: WorkspaceSourceRecord = {
      id: "source-" + String(this.nextSourceId),
      name,
      sizeBytes: source.size,
      kind: detected.kind,
      detected,
    };
    this.nextSourceId += 1;
    this.sources.set(record.id, { record, source });
    this.workspaceState = addSource(this.workspaceState, record);
    return record;
  }

  async analyzeSource(sourceId: string): Promise<AnalyzeResponse> {
    const source = this.requireSource(sourceId);
    // Only boot containers are analyzed, and those have to be in memory to be parsed and hashed.
    const bytes = await readAll(source.source, MAX_ANALYZABLE_BYTES);
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
    const held = this.sources.get(id);
    if (held) {
      const size = held.source.size;
      const start = Math.max(0, Math.min(offset, size));
      const take = length === undefined ? size - start : Math.max(0, length);
      return toStandaloneBuffer(await held.source.read(start, take));
    }
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
    // A source is digested by reading it; only images are ever digested this way.
    const held = this.sources.get(id);
    if (held) return sha256Hex(await readAll(held.source, MAX_ANALYZABLE_BYTES));
    return sha256Hex(this.bytesOf(id));
  }

  async listPackage(sourceId: string): Promise<OpenedPackage> {
    return openPackage(this.requireSource(sourceId).source);
  }

  async extractPackageEntry(sourceId: string, entryId: string): Promise<WorkspaceArtifact> {
    const source = this.requireSource(sourceId);
    const opened = await openPackage(source.source);
    const entry = opened.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new WorkerError(
        "The package has no entry " + entryId + ".",
        "Pick an entry from the listing.",
      );
    }
    const bytes = await extractEntryFrom(source.source, entryId);
    return this.registerArtifact({
      sourceId,
      parentId: sourceId,
      tool: "extract",
      name: entry.name,
      params: { entry: entryId },
      bytes: toStandaloneBuffer(bytes),
    });
  }

  // ---------------------------------------------------------------- partition containers

  async inspectPartition(sourceId: string): Promise<PartitionView> {
    const { source, record } = this.requireSource(sourceId);
    if (record.detected.container === "sparse") {
      const parsed = await parseSparse(source);
      return {
        kind: "sparse",
        header: parsed.header,
        sizeBytes: source.size,
        chunkCount: parsed.chunks.length,
        outputBytes: parsed.sizeBytes,
      };
    }
    if (record.detected.content === "erofs") {
      return { kind: "erofs", superblock: await parseErofs(source) };
    }
    if (record.detected.container === "raw" && record.detected.content === "unknown") {
      // A super image is raw bytes whose geometry struct sits at offset 0, which detection cannot
      // name; the magic is the only thing that tells it apart from any other raw image.
      const head = await source.read(0, 4);
      const magic = (head[0] | (head[1] << 8) | (head[2] << 16) | (head[3] << 24)) >>> 0;
      if (head.length === 4 && magic === LP_METADATA_GEOMETRY_MAGIC) {
        const parsed = await parseSuper(source);
        return {
          kind: "super",
          slot: parsed.slot,
          geometry: parsed.geometry,
          blockDevices: parsed.blockDevices.map((device) => ({ name: device.name, sizeBytes: device.sizeBytes })),
          partitions: parsed.partitions,
        };
      }
    }
    return { kind: "unsupported", detected: record.detected };
  }

  async unpackSparseSource(sourceId: string): Promise<WorkspaceArtifact> {
    const { source, record } = this.requireSource(sourceId);
    const parsed = await parseSparse(source);
    const bytes = await unpackSparse(source, parsed);
    return this.registerArtifact({
      sourceId,
      parentId: sourceId,
      tool: "unpack",
      name: record.name.replace(/\.sparse\.img$|\.img$/, "") + "-raw.img",
      params: { format: "sparse", blocks: String(parsed.header.totalBlocks) },
      bytes: toStandaloneBuffer(bytes),
    });
  }

  async extractLogicalPartition(sourceId: string, partitionName: string): Promise<WorkspaceArtifact> {
    const { source } = this.requireSource(sourceId);
    const parsed = await parseSuper(source);
    const logical = logicalPartitionSource(source, parsed, partitionName);
    const bytes = await readAll(logical, MAX_ANALYZABLE_BYTES);
    return this.registerArtifact({
      sourceId,
      parentId: sourceId,
      tool: "unpack",
      name: partitionName + ".img",
      params: { partition: partitionName },
      bytes: toStandaloneBuffer(bytes),
    });
  }

  async browseFilesystem(sourceId: string, path: string): Promise<FilesystemListing> {
    const { source, record } = this.requireSource(sourceId);
    if (record.detected.content === "ext4") {
      const superblock = await parseExt4(source);
      checkExt4Supported(superblock);
      const inode = await resolveExt4Path(source, superblock, path);
      const entries = await listExt4Directory(source, superblock, inode);
      const detailed: FilesystemListing["entries"] = [];
      for (const entry of entries.slice(0, 512)) {
        const child = await readExt4Inode(source, superblock, entry.ino);
        detailed.push({ name: entry.name, fileType: entry.fileType, sizeBytes: child.size });
      }
      return { path, kind: "ext4", entries: detailed };
    }

    const superblock = await parseErofs(source);
    const inode = await resolveErofsPath(source, superblock, path);
    if (!inode.isDirectory) {
      throw new WorkerError(
        "Inode " + inode.nid + " is not a directory.",
        "That path is not a directory in this image.",
      );
    }
    const entries = await readDirectory(source, superblock, inode);
    const detailed: FilesystemListing["entries"] = [];
    for (const entry of entries.slice(0, 512)) {
      const child = await readInode(source, superblock, entry.nid);
      detailed.push({
        name: entry.name,
        fileType: entry.fileType,
        sizeBytes: child.size,
        dataLayout: child.dataLayout,
      });
    }
    return { path, kind: "erofs", superblock, entries: detailed };
  }

  async readFilesystemFile(sourceId: string, path: string): Promise<Uint8Array> {
    const { source, record } = this.requireSource(sourceId);
    if (record.detected.content === "ext4") {
      const superblock = await parseExt4(source);
      checkExt4Supported(superblock);
      const inode = await resolveExt4Path(source, superblock, path);
      if (inode.isDirectory) {
        throw new WorkerError(
          "Inode " + inode.number + " is a directory.",
          "A directory is not a file; open it instead.",
        );
      }
      return readExt4File(source, superblock, inode);
    }
    const superblock = await parseErofs(source);
    const inode = await resolveErofsPath(source, superblock, path);
    if (inode.isDirectory) {
      throw new WorkerError(
        "Inode " + inode.nid + " is a directory.",
        "A directory is not a file; open it instead.",
      );
    }
    return readInodeData(source, superblock, inode);
  }

  async analyzeArtifact(artifactId: string): Promise<AnalyzeResponse> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new WorkerError("Artifact " + artifactId + " is not in this workspace.", "Extract it first.");
    }
    const bytes = artifact.bytes;
    const wasm = await loadWasmModule();
    const image = parseImage(bytes);
    const sha256 = await sha256Hex(bytes);
    this.state = {
      sourceId: artifact.record.sourceId,
      bytes,
      image,
      sha256,
      name: artifact.record.name,
    };
    this.controller = null;
    const report = await buildImageReport(image, {
      sourceName: artifact.record.name,
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
