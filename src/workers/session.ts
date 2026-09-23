import { WorkerError } from "../core/errors";
import { sha256Hex } from "../core/hash";
import { buildZip, parseImage } from "../core/image";
import { animationFrames, packAnimation, readAnimationZip } from "../core/animation";
import { bootSections, diffSources, sectionDiff } from "../core/diff";
import type { AnimationEntry } from "../core/animation";
import { DEFAULT_SPARSE_BLOCK_SIZE, packSparseStream, packSuperStream } from "../core/partition";
import type { SuperPartitionInput } from "../core/partition";
import type { ParsedImage } from "../core/image";
import { buildImageReport } from "../core/image/report";
import { createPatchEngine } from "../core/patch/engine";
import type { PatchEngine } from "../core/patch/engine";
import {
  blobSource,
  bytesSource,
  extractPackageEntry as extractEntryFrom,
  listZip,
  logicalPartitionStream,
  openPackage,
  parsePayload,
  payloadPartitionSource,
  payloadPartitionStream,
  readAll,
  readPrefix,
  storedEntrySource,
} from "../core/package";
import type { ByteSource, OpenedPackage } from "../core/package";
import type { DetectedArtifact } from "../core/workspace";
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
  decodeBmp,
  decodeMtkPixels,
  detectLogoFormat,
  fitRgba,
  packSplash,
  parseSplash,
  readBmpInfo,
  readSplashFrameBmp,
  parseMtkLogo,
  packMtkLogo,
  readMtkFrameRaw,
  readSplashFrameCompressed,
  suggestMtkResolutions,
} from "../core/logo";
import type { MtkPackEntry } from "../core/logo";

/** The longest side of a frame preview the editor asks for. */
const SPLASH_PREVIEW_MAX = 240;

/**
 * Partitions above this size are produced as a stream and kept as a blob instead of being
 * materialized: 256 MiB is comfortably more than any boot image, and far less than the partitions
 * that used to fail (a 759 MB `system`, a 3 GB `my_stock`).
 */
const STREAM_ARTIFACT_BYTES = 256 * 1024 * 1024;
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
  AnimationPackRequest,
  AnimationSummary,
  DiffSummary,
  ImageSummary,
  PatchRequest,
  PatchResponse,
  PatchWorkerApi,
  PlanRequest,
  PlanResponse,
  PartitionView,
  ProgressSink,
  RegisterArtifactRequest,
  SplashPreview,
  SplashReplacementRequest,
  SplashSummary,
  SuperPackRequest,
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
  /** Small artifacts live in memory as bytes. */
  bytes: Uint8Array | null;
  /**
   * Big ones are a `Blob` built from a stream: browsers keep those on disk, so a three gigabyte
   * partition can be produced operation by operation and never exist as one buffer.
   */
  blob: Blob | null;
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
    const artifact = this.artifacts.get(id);
    if (artifact?.blob) {
      const size = artifact.blob.size;
      const start = Math.max(0, Math.min(offset, size));
      const end = length === undefined ? size : Math.max(start, Math.min(start + length, size));
      return toStandaloneBuffer(new Uint8Array(await artifact.blob.slice(start, end).arrayBuffer()));
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
    this.artifacts.set(record.id, { record, bytes, blob: null });
    this.workspaceState = addArtifact(this.workspaceState, record);
    return record;
  }

  /**
   * Keeps a partition that is being produced as a stream. The bytes of a `Blob` live outside the
   * JavaScript heap in a browser, which is what makes extracting a three gigabyte partition possible.
   */
  private async registerStreamedArtifact(
    request: { sourceId: string; parentId: string; tool: string; name: string; params: Record<string, string> },
    stream: ReadableStream<Uint8Array>,
  ): Promise<WorkspaceArtifact> {
    const blob = await new Response(stream).blob();
    const detected = detectArtifact(new Uint8Array(await blob.slice(0, 8192).arrayBuffer()));
    const record: WorkspaceArtifact = {
      id: derivedArtifactId(request.sourceId, request.tool, request.name),
      sourceId: request.sourceId,
      parentId: request.parentId,
      tool: request.tool,
      params: { ...request.params, streamed: "true" },
      name: request.name,
      sizeBytes: blob.size,
      kind: detected.kind,
      detected,
    };
    this.artifacts.set(record.id, { record, bytes: null, blob });
    this.workspaceState = addArtifact(this.workspaceState, record);
    return record;
  }

  /** The `Blob` behind an artifact, so the page can hand it to the browser as a download. */
  async artifactBlob(id: string): Promise<Blob> {
    const artifact = this.artifacts.get(id);
    if (!artifact) {
      throw new WorkerError("Nothing in the workspace has the id " + id + ".", "Extract it first.");
    }
    if (artifact.blob) return artifact.blob;
    return new Blob([(artifact.bytes as Uint8Array) as BlobPart]);
  }

  async digestArtifact(id: string): Promise<string> {
    // A source is digested by reading it; only images are ever digested this way.
    const held = this.sources.get(id);
    if (held) return sha256Hex(await readAll(held.source, MAX_ANALYZABLE_BYTES));
    const artifact = this.artifacts.get(id);
    if (artifact?.blob) {
      throw new WorkerError(
        "Artifact " + id + " is " + artifact.blob.size + " bytes and is kept as a blob, not in memory.",
        "This artifact is too large to hash here; download it and check it on your own machine.",
      );
    }
    return sha256Hex(this.bytesOf(id));
  }

  async listPackage(sourceId: string): Promise<OpenedPackage> {
    return openPackage(this.requireSource(sourceId).source);
  }

  /**
   * Extracts a set of entries one after another. Each one goes through the same path as a single
   * extraction, so a partition above the streaming threshold is still produced as a blob rather than
   * held in memory.
   */
  async extractEntries(sourceId: string, entryIds: string[]): Promise<WorkspaceArtifact[]> {
    if (entryIds.length === 0) {
      throw new WorkerError("Nothing was selected.", "Pick at least one entry.");
    }
    const out: WorkspaceArtifact[] = [];
    for (const entryId of entryIds) {
      out.push(await this.extractPackageEntry(sourceId, entryId));
    }
    return out;
  }

  async extractPackageEntry(
    sourceId: string,
    entryId: string,
    options: { stream?: boolean } = {},
  ): Promise<WorkspaceArtifact> {
    const source = this.requireSource(sourceId);
    const opened = await openPackage(source.source);
    const entry = opened.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new WorkerError(
        "The package has no entry " + entryId + ".",
        "Pick an entry from the listing.",
      );
    }
    // A partition inside a payload that is too big to hold is streamed into a blob instead.
    const separator = entryId.indexOf("::");
    if (separator >= 0 && (options.stream === true || entry.sizeBytes > STREAM_ARTIFACT_BYTES)) {
      const containerName = entryId.slice(0, separator);
      const partitionName = entryId.slice(separator + 2);
      const zipEntry = (await listZip(source.source)).find((candidate) => candidate.name === containerName);
      if (!zipEntry) {
        throw new WorkerError("The archive has no entry " + containerName + ".", "Open the package again.");
      }
      const payloadSource = storedEntrySource(source.source, zipEntry);
      const payload = await parsePayload(payloadSource);
      return this.registerStreamedArtifact(
        { sourceId, parentId: sourceId, tool: "extract", name: entry.name, params: { entry: entryId } },
        payloadPartitionStream(payloadSource, payload, partitionName),
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

  /**
   * The bytes a tool should look at: the opened file itself, or one entry inside it. A payload
   * partition inside an OTA zip becomes a range source, so a 759 MB `system` is browsed without ever
   * being materialized.
   */
  private async viewSource(
    sourceId: string,
    inside?: string,
  ): Promise<{ source: ByteSource; detected: DetectedArtifact }> {
    const held = this.requireSource(sourceId);
    if (!inside) return { source: held.source, detected: held.record.detected };

    const separator = inside.indexOf("::");
    const containerName = separator >= 0 ? inside.slice(0, separator) : inside;
    const entry = (await listZip(held.source)).find((candidate) => candidate.name === containerName);
    if (!entry) {
      throw new WorkerError(
        "The archive has no entry named " + containerName + ".",
        "That entry is not in this archive.",
      );
    }
    const containerSource = storedEntrySource(held.source, entry);
    const nested =
      separator >= 0
        ? payloadPartitionSource(containerSource, await parsePayload(containerSource), inside.slice(separator + 2))
        : containerSource;
    return { source: nested, detected: detectArtifact(await readPrefix(nested, 8192)) };
  }

  async inspectPartition(sourceId: string, inside?: string): Promise<PartitionView> {
    const { source, detected: record } = await this.viewSource(sourceId, inside);
    const detected = record;
    if (detected.container === "sparse") {
      const parsed = await parseSparse(source);
      return {
        kind: "sparse",
        header: parsed.header,
        sizeBytes: source.size,
        chunkCount: parsed.chunks.length,
        outputBytes: parsed.sizeBytes,
      };
    }
    if (detected.content === "erofs") {
      return { kind: "erofs", superblock: await parseErofs(source) };
    }
    if (detected.container === "raw" && detected.content === "unknown") {
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
    return { kind: "unsupported", detected };
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

  async extractLogicalPartition(
    sourceId: string,
    partitionName: string,
    options: { stream?: boolean } = {},
  ): Promise<WorkspaceArtifact> {
    const { source } = this.requireSource(sourceId);
    const parsed = await parseSuper(source);
    const declared = parsed.partitions.find((entry) => entry.name === partitionName);
    if (options.stream === true || (declared?.sizeBytes ?? 0) > STREAM_ARTIFACT_BYTES) {
      return this.registerStreamedArtifact(
        { sourceId, parentId: sourceId, tool: "unpack", name: partitionName + ".img", params: { partition: partitionName } },
        logicalPartitionStream(source, parsed, partitionName),
      );
    }
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

  // ---------------------------------------------------------------- splash images

  async inspectSplash(
    sourceId: string,
    inside?: string,
    resolution?: { width: number; height: number },
    frameResolutions?: Record<string, { width: number; height: number }>,
  ): Promise<SplashSummary> {
    const { source } = await this.viewSource(sourceId, inside);
    const format = await detectLogoFormat(source);
    if (format?.id === "mtk-logo") {
      const screen = resolution ?? { width: 0, height: 0 };
      const parsed = await parseMtkLogo(source, screen, frameResolutions ?? {});
      const frames = parsed.frames.map((frame) => ({
        index: frame.index,
        // the container records no names; the page labels them by index
        name: "",
        realSize: frame.rawSize,
        compressedSize: frame.compressedSize,
        width: frame.layout?.width ?? 0,
        height: frame.layout?.height ?? 0,
        bitsPerPixel: (frame.layout?.bytesPerPixel ?? 0) * 8,
        pixelsPerMeter: 0,
        trailingBytes: 0,
        layout: frame.layout
          ? {
              bytesPerPixel: frame.layout.bytesPerPixel,
              stride: frame.layout.stride,
              prefixBytes: frame.layout.prefixBytes,
            }
          : null,
      }));
      const largest = parsed.frames.reduce(
        (best, frame) => (frame.rawSize > best.rawSize ? frame : best),
        parsed.frames[0],
      );
      return {
        format: format.id,
        frames,
        headerWidth: screen.width,
        headerHeight: screen.height,
        hasDdph: false,
        sizeBytes: source.size,
        needsResolution: frames.every((frame) => frame.layout === null),
        suggestions: suggestMtkResolutions(largest.rawSize).map(({ width, height }) => ({ width, height })),
      };
    }
    const parsed = await parseSplash(source);
    const frames: SplashSummary["frames"] = [];
    for (const frame of parsed.frames) {
      // One frame at a time: a real splash holds twenty of them at ten megabytes each, and the
      // listing only needs their size.
      const bmp = await readSplashFrameBmp(source, frame);
      const info = readBmpInfo(bmp);
      const rowSize = Math.ceil((info.width * 3) / 4) * 4;
      frames.push({
        index: frame.index,
        name: frame.name,
        realSize: frame.realSize,
        compressedSize: frame.compressedSize,
        width: info.width,
        height: info.height,
        bitsPerPixel: info.bitsPerPixel,
        pixelsPerMeter: info.pixelsPerMeter,
        trailingBytes: Math.max(0, bmp.length - (54 + rowSize * info.height)),
      });
    }
    return {
      format: format?.id ?? "unknown",
      frames,
      headerWidth: parsed.width,
      headerHeight: parsed.height,
      hasDdph: parsed.hasDdph,
      sizeBytes: source.size,
    };
  }

  async readSplashFrameBmp(sourceId: string, inside: string | undefined, index: number): Promise<ArrayBuffer> {
    const { source } = await this.viewSource(sourceId, inside);
    const format = await detectLogoFormat(source);
    if (format?.id === "mtk-logo") {
      const mtk = await parseMtkLogo(source, { width: 0, height: 0 });
      const entry = mtk.frames[index];
      if (!entry) {
        throw new WorkerError("This logo image has no block " + index + ".", "Pick a frame from the list.");
      }
      return toStandaloneBuffer(await readMtkFrameRaw(source, entry));
    }
    const parsed = await parseSplash(source);
    const frame = parsed.frames[index];
    if (!frame) {
      throw new WorkerError("This splash image has no frame " + index + ".", "Pick a frame from the list.");
    }
    return toStandaloneBuffer(await readSplashFrameBmp(source, frame));
  }

  async readSplashFramePreview(
    sourceId: string,
    inside: string | undefined,
    index: number,
    resolution?: { width: number; height: number },
    frameResolutions?: Record<string, { width: number; height: number }>,
  ): Promise<SplashPreview> {
    const { source } = await this.viewSource(sourceId, inside);
    const format = await detectLogoFormat(source);
    if (format?.id === "mtk-logo") {
      if (!resolution) {
        throw new WorkerError(
          "A MediaTek logo needs the screen resolution before its blocks can be read.",
          "Give the screen resolution first.",
        );
      }
      const parsed = await parseMtkLogo(source, resolution, frameResolutions ?? {});
      const frame = parsed.frames[index];
      if (!frame?.layout) {
        throw new WorkerError(
          "Block " + index + " is " + (frame?.rawSize ?? 0) + " bytes, which " + resolution.width + "x" + resolution.height + " does not explain.",
          "This block is not the resolution you gave.",
        );
      }
      const rgba = decodeMtkPixels(await readMtkFrameRaw(source, frame), frame.layout);
      return this.previewOf(rgba, frame.layout.width, frame.layout.height);
    }
    const parsed = await parseSplash(source);
    const frame = parsed.frames[index];
    if (!frame) {
      throw new WorkerError("This splash image has no frame " + index + ".", "Pick a frame from the list.");
    }
    const bmp = await readSplashFrameBmp(source, frame);
    const decoded = decodeBmp(bmp);
    return this.previewOf(decoded.rgba, decoded.width, decoded.height);
  }

  /**
   * Checks what a packer claims instead of trusting it, by reading the rebuilt image back through the
   * same parsers the editor used: every frame the user left alone has to come back byte for byte, and
   * a pack with no replacements at all has to reproduce the whole image. Both containers share this,
   * so a third one gets the check for free.
   */
  private async verifyRepack(input: {
    source: ByteSource;
    rebuilt: Uint8Array;
    replaced: number;
    /** Frame indices the user did not replace. */
    untouched: number[];
    storedInSource: (index: number) => Promise<Uint8Array>;
    storedInRebuilt: (index: number) => Promise<Uint8Array>;
  }): Promise<"identical" | "frames-intact" | "different"> {
    for (const index of input.untouched) {
      const before = await input.storedInSource(index);
      const after = await input.storedInRebuilt(index);
      if (before.length !== after.length || !before.every((byte, at) => byte === after[at])) {
        return "different";
      }
    }
    const identical =
      input.replaced === 0 &&
      input.rebuilt.length === input.source.size &&
      (await sha256Hex(input.rebuilt)) === (await sha256Hex(await readAll(input.source)));
    return identical ? "identical" : "frames-intact";
  }

  /** Scales a frame's pixels down to what a list needs, keeping the aspect ratio. */
  private previewOf(rgba: Uint8Array, width: number, height: number): SplashPreview {
    if (width <= SPLASH_PREVIEW_MAX && height <= SPLASH_PREVIEW_MAX) {
      return {
        width,
        height,
        fullWidth: width,
        fullHeight: height,
        rgba: toStandaloneBuffer(rgba),
      };
    }
    const scale = SPLASH_PREVIEW_MAX / Math.max(width, height);
    const scaled = fitRgba(
      rgba,
      width,
      height,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
      "stretch",
    );
    return {
      width: scaled.width,
      height: scaled.height,
      fullWidth: width,
      fullHeight: height,
      rgba: toStandaloneBuffer(scaled.rgba),
    };
  }

  async packSplashImage(
    sourceId: string,
    inside: string | undefined,
    replacements: SplashReplacementRequest[],
    resolution?: { width: number; height: number },
    frameResolutions?: Record<string, { width: number; height: number }>,
  ): Promise<WorkspaceArtifact> {
    const { source } = await this.viewSource(sourceId, inside);
    const detected = await detectLogoFormat(source);
    const byIndex = new Map(replacements.map((entry) => [entry.index, entry]));

    if (detected?.id === "mtk-logo") {
      if (!resolution) {
        throw new WorkerError(
          "A MediaTek logo needs the screen resolution to be rebuilt.",
          "Give the screen resolution first.",
        );
      }
      const mtk = await parseMtkLogo(source, resolution, frameResolutions ?? {});
      const mtkEntries: MtkPackEntry[] = mtk.frames.map((frame) => {
        const replacement = byIndex.get(frame.index);
        if (!replacement || !frame.layout) return { kind: "keep", frame };
        const raw = new Uint8Array(replacement.payload);
        if (raw.length !== frame.rawSize) {
          throw new WorkerError(
            "A replacement for block " + frame.index + " is " + raw.length + " bytes, not " + frame.rawSize + ".",
            "That frame was built for a different size.",
          );
        }
        return { kind: "replace", frame, raw };
      });
      const packedMtk = await packMtkLogo(source, mtk, mtkEntries);
      const check = bytesSource(packedMtk.bytes);
      const reparsed = await parseMtkLogo(check, resolution, frameResolutions ?? {});
      const mtkVerified = await this.verifyRepack({
        source,
        rebuilt: packedMtk.bytes,
        replaced: packedMtk.replaced,
        untouched: mtk.frames.filter((frame) => !(byIndex.has(frame.index) && frame.layout)).map((frame) => frame.index),
        storedInSource: async (index) => readMtkFrameRaw(source, mtk.frames[index]),
        storedInRebuilt: async (index) => readMtkFrameRaw(check, reparsed.frames[index]),
      });
      const mtkName =
        (this.sources.get(sourceId)?.record.name ?? "logo.img").replace(/\.[a-z]+$/i, "") + "-patched.img";
      return this.registerArtifact({
        sourceId,
        parentId: sourceId,
        tool: "logo",
        name: mtkName,
        params: {
          replaced: String(packedMtk.replaced),
          sizeDelta: String(packedMtk.sizeDelta),
          verified: mtkVerified,
          format: "mtk-logo",
        },
        bytes: toStandaloneBuffer(packedMtk.bytes),
      });
    }

    const parsed = await parseSplash(source);
    const entries = parsed.frames.map((frame) => {
      const replacement = byIndex.get(frame.index);
      return replacement === undefined
        ? ({ kind: "keep", frame } as const)
        : ({
            kind: "replace",
            index: frame.index,
            bmp: new Uint8Array(replacement.payload),
            name: replacement.name,
          } as const);
    });
    const packed = await packSplash(source, parsed, entries);

    const rebuilt = bytesSource(packed.bytes);
    const reparsedSplash = await parseSplash(rebuilt);
    const verified = await this.verifyRepack({
      source,
      rebuilt: packed.bytes,
      replaced: packed.replaced,
      untouched: parsed.frames.filter((frame) => !byIndex.has(frame.index)).map((frame) => frame.index),
      storedInSource: async (index) => readSplashFrameCompressed(source, parsed.frames[index]),
      storedInRebuilt: async (index) => readSplashFrameCompressed(rebuilt, reparsedSplash.frames[index]),
    });

    const name =
      (this.sources.get(sourceId)?.record.name ?? "splash.img").replace(/\.img$/, "") + "-patched.img";
    return this.registerArtifact({
      sourceId,
      parentId: sourceId,
      tool: "logo",
      name,
      params: {
        replaced: String(packed.replaced),
        sizeDelta: String(packed.sizeDelta),
        verified,
      },
      bytes: toStandaloneBuffer(packed.bytes),
    });
  }

  async packSparseArtifact(artifactId: string, options: { blockSize?: number } = {}): Promise<WorkspaceArtifact> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new WorkerError("Nothing in the workspace has the id " + artifactId + ".", "Extract it first.");
    }
    const blob = await this.artifactBlob(artifactId);
    const source = blobSource(blob);
    const blockSize = options.blockSize ?? DEFAULT_SPARSE_BLOCK_SIZE;
    const stream = await packSparseStream(source, { blockSize });
    const name = artifact.record.name.replace(/\.[a-z0-9]+$/i, "") + ".sparse.img";
    // a partition is a whole number of blocks, a random file usually is not, and the tail is padded:
    // say by how much rather than leaving the difference to be discovered
    const paddedBytes = Math.ceil(source.size / blockSize) * blockSize - source.size;
    return this.registerStreamedArtifact(
      {
        sourceId: artifact.record.sourceId,
        parentId: artifactId,
        tool: "sparse",
        name,
        params: { sparse: "true", blockSize: String(blockSize), paddedBytes: String(paddedBytes) },
      },
      stream,
    );
  }

  async packSuperImage(request: SuperPackRequest): Promise<WorkspaceArtifact> {
    if (request.partitions.length === 0) {
      throw new WorkerError("A super image with no partitions holds nothing.", "Pick at least one partition.");
    }
    const inputs: SuperPartitionInput[] = [];
    let firstSourceId = "";
    for (const partition of request.partitions) {
      const artifact = this.artifacts.get(partition.artifactId);
      if (!artifact) {
        throw new WorkerError(
          "Nothing in the workspace has the id " + partition.artifactId + ".",
          "Extract that partition first.",
        );
      }
      firstSourceId = firstSourceId || artifact.record.sourceId;
      const fallback = artifact.record.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[^A-Za-z0-9_]/g, "_");
      inputs.push({
        // the container has no place to keep a display name, so the file's own name is the partition
        name: partition.name ?? fallback,
        source: blobSource(await this.artifactBlob(partition.artifactId)),
        group: partition.group,
        writable: partition.writable,
      });
    }
    const stream = await packSuperStream(inputs, {
      deviceSize: request.deviceSize,
      metadataSize: request.metadataSize,
      metadataSlots: request.metadataSlots,
      alignment: request.alignment,
      groups: request.groups,
      metadataOnly: request.metadataOnly,
    });
    return this.registerStreamedArtifact(
      {
        sourceId: firstSourceId,
        parentId: request.partitions[0].artifactId,
        tool: "super",
        name: request.metadataOnly ? "super_empty.img" : "super.img",
        params: {
          super: "true",
          partitions: String(inputs.length),
          alignment: String(request.alignment ?? 1024 * 1024),
          ...(request.metadataOnly ? { metadataOnly: "true" } : {}),
        },
      },
      stream,
    );
  }

  /**
   * Compares the open source with an artifact, byte by byte, and names the sections any difference
   * falls in when the source is a boot image. This is what verifies a patch against the original.
   */
  async compareWithArtifact(
    sourceId: string,
    inside: string | undefined,
    artifactId: string,
  ): Promise<DiffSummary> {
    const { source } = await this.viewSource(sourceId, inside);
    const other = blobSource(await this.artifactBlob(artifactId));
    const diff = await diffSources(source, other);
    const sections = await bootSections(source);
    return {
      sizeA: diff.sizeA,
      sizeB: diff.sizeB,
      identical: diff.identical,
      differingBytes: diff.differingBytes,
      ranges: diff.ranges,
      truncated: diff.truncated,
      sections: sections === null ? null : sectionDiff(diff.ranges, sections, Math.max(diff.sizeA, diff.sizeB)),
      kind: sections === null ? null : "boot",
    };
  }

  async inspectAnimation(sourceId: string, inside?: string): Promise<AnimationSummary> {
    const { source } = await this.viewSource(sourceId, inside);
    const archive = await readAnimationZip(source);
    const parts = archive.animation.parts.map((part) => ({
      path: part.path,
      type: part.type,
      count: part.count,
      pause: part.pause,
      frames: animationFrames(archive, part.path).map((frame) => ({
        name: frame.name,
        sizeBytes: frame.sizeBytes ?? frame.data?.length ?? 0,
        compressedSize: frame.compressedSize ?? frame.data?.length ?? 0,
      })),
    }));
    const frameNames = new Set(parts.flatMap((part) => part.frames.map((frame) => frame.name)));
    return {
      desc: archive.desc,
      width: archive.animation.width,
      height: archive.animation.height,
      fps: archive.animation.fps,
      dialect:
        archive.animation.lines.find((line) => line.kind === "global")?.dialect === "vendor-g"
          ? "vendor-g"
          : "standard",
      parts,
      otherEntries: archive.entries
        .filter((entry) => entry.name !== "desc.txt" && !frameNames.has(entry.name))
        .map((entry) => entry.name),
      sizeBytes: source.size,
    };
  }

  async readAnimationFrame(
    sourceId: string,
    inside: string | undefined,
    name: string,
  ): Promise<ArrayBuffer> {
    const { source } = await this.viewSource(sourceId, inside);
    const archive = await readAnimationZip(source);
    const entry = archive.entries.find((candidate) => candidate.name === name);
    if (!entry?.data) {
      throw new WorkerError(
        "The archive has no frame called " + name + ".",
        "Pick a frame from the list.",
      );
    }
    return toStandaloneBuffer(entry.data);
  }

  async packAnimationArchive(
    sourceId: string,
    inside: string | undefined,
    request: AnimationPackRequest,
  ): Promise<WorkspaceArtifact> {
    const { source } = await this.viewSource(sourceId, inside);
    const archive = await readAnimationZip(source);
    const replacements = new Map(request.replacements.map((entry) => [entry.name, entry.data]));

    const entries: AnimationEntry[] = archive.entries.map((entry) => {
      const replacement = replacements.get(entry.name);
      if (replacement === undefined) return entry;
      return { ...entry, data: new Uint8Array(replacement) };
    });
    if (request.desc !== undefined) {
      const descEntry = entries.find((entry) => entry.name === "desc.txt");
      if (descEntry) descEntry.data = new TextEncoder().encode(request.desc);
    }

    const packed = await packAnimation(entries);

    // Check what the packer claims: every entry the user did not touch has to come back byte for byte.
    const check = await readAnimationZip(bytesSource(packed));
    let intact = true;
    for (const entry of archive.entries) {
      const replacement = replacements.get(entry.name);
      if (replacement !== undefined) continue;
      const after = check.entries.find((candidate) => candidate.name === entry.name);
      const before = entry.data ?? new Uint8Array(0);
      const now = after?.data ?? new Uint8Array(0);
      if (before.length !== now.length || !before.every((byte, index) => byte === now[index])) {
        intact = false;
        break;
      }
    }

    return this.registerArtifact({
      sourceId,
      parentId: sourceId,
      tool: "animation",
      name: "bootanimation.zip",
      params: {
        animation: "true",
        replaced: String(request.replacements.length),
        descRewritten: String(request.desc !== undefined),
        verified: intact ? "entries-intact" : "different",
      },
      bytes: toStandaloneBuffer(packed),
    });
  }

  /** Zips files a tool built in the page (pictures, a manifest) and keeps the archive as an artifact. */
  async exportFilesAsZip(
    sourceId: string,
    name: string,
    files: { name: string; data: ArrayBuffer }[],
  ): Promise<WorkspaceArtifact> {
    const archive = await buildZip(
      files.map((file) => ({ name: file.name, data: new Uint8Array(file.data) })),
    );
    return this.registerArtifact({
      sourceId,
      parentId: sourceId,
      tool: "export",
      name,
      params: { entries: String(files.length) },
      bytes: toStandaloneBuffer(archive),
    });
  }

  async browseFilesystem(sourceId: string, path: string, inside?: string): Promise<FilesystemListing> {
    const { source, detected } = await this.viewSource(sourceId, inside);
    if (detected.content === "ext4") {
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

  /**
   * Keeps a file read out of a filesystem image as an artifact, so a tool can open it. The archive of
   * a boot animation, for one: it lives inside the image, and this is what turns it into something the
   * animation tool can read.
   */
  async extractFilesystemFileAs(
    sourceId: string,
    path: string,
    inside?: string,
  ): Promise<WorkspaceArtifact> {
    const bytes = await this.readFilesystemFile(sourceId, path, inside);
    const name = path.split("/").filter((part) => part !== "").pop() ?? "file";
    return this.registerArtifact({
      sourceId,
      parentId: sourceId,
      tool: "unpack",
      name,
      params: { path },
      bytes: toStandaloneBuffer(bytes),
    });
  }

  /**
   * Opens an artifact as a source of its own, without treating it as an image: an artifact is bytes,
   * and a plain zip or an animation archive is as good a thing to look at as a boot image.
   */
  async openArtifactSource(artifactId: string): Promise<WorkspaceSourceRecord> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new WorkerError("Nothing in the workspace has the id " + artifactId + ".", "Extract it first.");
    }
    const blob = await this.artifactBlob(artifactId);
    return this.openSource(blob, artifact.record.name);
  }

  async readFilesystemFile(sourceId: string, path: string, inside?: string): Promise<Uint8Array> {
    const { source, detected } = await this.viewSource(sourceId, inside);
    if (detected.content === "ext4") {
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
    // Analyzing means parsing and hashing, so the artifact has to be in memory: a boot image is a
    // few megabytes, and anything bigger is refused by the same limit the sources use.
    const bytes =
      artifact.bytes ?? new Uint8Array(await (artifact.blob as Blob).arrayBuffer());
    if (bytes.length > MAX_ANALYZABLE_BYTES) {
      throw new WorkerError(
        "Artifact " + artifactId + " is " + bytes.length + " bytes.",
        "This artifact is too large to analyze.",
      );
    }
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
    if (artifact?.bytes) return artifact.bytes;
    throw new WorkerError(
      "Nothing in the workspace holds " + id + " in memory.",
      "Open the file again.",
    );
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
