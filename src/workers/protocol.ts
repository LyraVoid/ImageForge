import type { ArtifactKind, DetectedArtifact, WorkspaceArtifact } from "../core/workspace";
import type { OpenedPackage } from "../core/package";
import type { ErofsSuperblock, Ext4Superblock, LpPartition, SparseHeader } from "../core/partition";
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

/** What the unpack tool found when it looked at an open source. */
export type PartitionView =
  | { kind: "sparse"; header: SparseHeader; sizeBytes: number; chunkCount: number; outputBytes: number }
  | {
      kind: "super";
      slot: number;
      geometry: { metadataMaxSize: number; metadataSlotCount: number; logicalBlockSize: number };
      blockDevices: { name: string; sizeBytes: number }[];
      partitions: LpPartition[];
    }
  | { kind: "erofs"; superblock: ErofsSuperblock }
  | { kind: "ext4"; superblock: Ext4Superblock }
  | { kind: "unsupported"; detected: DetectedArtifact };

/** A frame of a splash image, as the editor lists it. */
export interface SplashFrameSummary {
  index: number;
  name: string;
  /** Size of the decompressed BMP. */
  realSize: number;
  /** Size of the gzip stream it is stored as. */
  compressedSize: number;
  width: number;
  height: number;
  bitsPerPixel: number;
  /** The resolution field the vendor's file declares, so a replacement can keep it. */
  pixelsPerMeter: number;
  /** Bytes the vendor's file carries after the pixels; their size fields count them. */
  trailingBytes: number;
  /**
   * How a MediaTek block's pixels are laid out, or null when the length does not fit the resolution
   * that was given (a small icon, or a resolution that is not the device's). Splash frames have none.
   */
  layout?: { bytesPerPixel: number; stride: number; prefixBytes: number } | null;
}

export interface SplashSummary {
  /** Which container this is, as the format table names it. */
  format: string;
  frames: SplashFrameSummary[];
  /** The header's own screen size, which is *not* a bound on the frames. */
  headerWidth: number;
  headerHeight: number;
  hasDdph: boolean;
  sizeBytes: number;
  /**
   * True for a container whose resolution is not recorded, so the page has to ask for it. MediaTek's
   * logo is the one: the same block length fits several screen sizes and only the right one decodes
   * to a picture, so the page shows these candidates and the preview settles it.
   */
  needsResolution?: boolean;
  suggestions?: { width: number; height: number }[];
}

/** A frame scaled down for display: the pixels plus the size they should be drawn at. */
export interface SplashPreview {
  width: number;
  height: number;
  /** The full frame's size, so the interface can show it next to the preview. */
  fullWidth: number;
  fullHeight: number;
  rgba: ArrayBuffer;
}

/** Where two images differ, and which part of a boot image those bytes belong to. */
export interface DiffSectionSummary {
  name: string;
  start: number;
  end: number;
  differingBytes: number;
  ranges: { start: number; length: number }[];
}

export interface DiffSummary {
  sizeA: number;
  sizeB: number;
  identical: boolean;
  differingBytes: number;
  ranges: { start: number; length: number }[];
  truncated: boolean;
  /** The sections of a boot image, or null when the source is not one. */
  sections: DiffSectionSummary[] | null;
  kind: string | null;
}

/** One frame of a boot animation, as the archive holds it. */
export interface AnimationFrameSummary {
  name: string;
  sizeBytes: number;
  compressedSize: number;
}

/** One part of a boot animation: a directory of frames and how the system plays it. */
export interface AnimationPartSummary {
  path: string;
  type: string;
  count: number;
  pause: number;
  frames: AnimationFrameSummary[];
}

export interface AnimationSummary {
  /** The desc.txt exactly as it is stored, and what it parses to. */
  desc: string;
  width: number;
  height: number;
  fps: number;
  /** "vendor-g" when the file uses the offset carrying line a real device ships. */
  dialect: string;
  parts: AnimationPartSummary[];
  /** Entries that are neither desc.txt nor a frame: the part directories, mostly. */
  otherEntries: string[];
  sizeBytes: number;
}

export interface AnimationPackRequest {
  /** The desc.txt to write. Omitted keeps the one the source has, byte for byte. */
  desc?: string;
  /** Frames to replace, named as they are inside the archive. */
  replacements: { name: string; data: ArrayBuffer }[];
}

/** What the super image builder needs: which artifacts, and how to lay them out. */
export interface SuperPackRequest {
  partitions: { artifactId: string; name?: string; group?: string; writable?: boolean }[];
  deviceSize?: number;
  metadataSize?: number;
  metadataSlots?: number;
  alignment?: number;
  groups?: { name: string; maximumSize: number }[];
  /** Write only the metadata, the compact super_empty image fastboot takes. */
  metadataOnly?: boolean;
}

export interface SplashReplacementRequest {
  index: number;
  /**
   * The replacement frame as the container stores it: a BMP for a splash image, raw pixels in the
   * frame's own layout for a MediaTek logo.
   */
  payload: ArrayBuffer;
  name?: string;
}

/** One directory of a filesystem image, whichever kind it is. */
export interface FilesystemListing {
  path: string;
  kind: "erofs" | "ext4";
  /** The erofs superblock, when there is one; ext4 keeps its own. */
  superblock?: ErofsSuperblock;
  entries: {
    name: string;
    fileType: string;
    sizeBytes: number;
    /** erofs storage form, when the image is erofs. */
    dataLayout?: string;
  }[];
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
  /** Opens a file into the workspace and reports what it is. A Blob is kept as a handle. */
  openSource(file: ArrayBuffer | Blob, name?: string): Promise<WorkspaceSourceRecord>;
  /** Analyzes a source that is already open, which is how the patcher starts from the workspace. */
  analyzeSource(sourceId: string): Promise<AnalyzeResponse>;
  workspace(): Promise<WorkspaceSnapshot>;
  /** Reads a range of a source or an artifact, so a caller can look inside something big. */
  readArtifact(id: string, offset?: number, length?: number): Promise<ArrayBuffer>;
  registerArtifact(request: RegisterArtifactRequest): Promise<WorkspaceArtifact>;
  /** Lists what a package holds (zip entries or payload partitions) without extracting anything. */
  listPackage(sourceId: string): Promise<OpenedPackage>;
  /**
   * Extracts one entry and keeps it in the workspace as an artifact. Partitions above the streaming
   * threshold are produced operation by operation into a `Blob`; `stream` forces that path.
   */
  extractPackageEntry(sourceId: string, entryId: string, options?: { stream?: boolean }): Promise<WorkspaceArtifact>;
  /** The artifact as a `Blob`, which is what a browser can download without a copy in memory. */
  artifactBlob(id: string): Promise<Blob>;
  /**
   * Rewrites an artifact as an Android sparse image, which is what flashing and packaging tools
   * take. The result is produced as a stream and kept as a blob, so a large partition never has to
   * be in memory. The chunking matches AOSP's `img2simg` for the same input.
   */
  packSparseArtifact(artifactId: string, options?: { blockSize?: number }): Promise<WorkspaceArtifact>;
  /**
   * Lays workspace artifacts out as a super image, in the order given, the way AOSP's lpmake does.
   * The partitions are copied through in chunks into a blob, so a large set stays out of memory.
   */
  packSuperImage(request: SuperPackRequest): Promise<WorkspaceArtifact>;
  /** Hands an artifact to the patcher, which reads its bytes where they already are. */
  analyzeArtifact(artifactId: string): Promise<AnalyzeResponse>;
  /** What kind of partition container the open source is, and what it holds. */
  inspectPartition(sourceId: string, inside?: string): Promise<PartitionView>;
  /** Unpacks a sparse image and keeps the raw image as an artifact. */
  unpackSparseSource(sourceId: string): Promise<WorkspaceArtifact>;
  /** Reads one logical partition out of a super image into an artifact. */
  extractLogicalPartition(
    sourceId: string,
    partitionName: string,
    options?: { stream?: boolean },
  ): Promise<WorkspaceArtifact>;
  /**
   * Lists a directory of a filesystem image (erofs or ext4). `inside` names an entry within the
   * opened file — a zip entry, or a payload partition like `payload.bin::system` — which is read in
   * ranges instead of being extracted first.
   */
  /**
   * Lists the frames of a logo image, whichever container it is. A MediaTek logo needs the screen
   * resolution to make sense of its blocks, which is what `resolution` is for.
   */
  inspectSplash(
    sourceId: string,
    inside?: string,
    resolution?: { width: number; height: number },
  ): Promise<SplashSummary>;
  /** One frame as the container stores it: a BMP for splash, raw pixels for a MediaTek logo. */
  readSplashFrameBmp(sourceId: string, inside: string | undefined, index: number): Promise<ArrayBuffer>;
  /** A frame as a small RGBA preview, so the editor never holds a ten megabyte image in the page. */
  readSplashFramePreview(
    sourceId: string,
    inside: string | undefined,
    index: number,
    resolution?: { width: number; height: number },
  ): Promise<SplashPreview>;
  /** Compares the open source with an artifact, byte by byte. */
  compareWithArtifact(sourceId: string, inside: string | undefined, artifactId: string): Promise<DiffSummary>;
  /** Reads a boot animation: its desc.txt, its parts and their frames. */
  inspectAnimation(sourceId: string, inside?: string): Promise<AnimationSummary>;
  /** One frame's bytes, which is what the preview draws. */
  readAnimationFrame(sourceId: string, inside: string | undefined, name: string): Promise<ArrayBuffer>;
  /** Writes the animation again with the given frames replaced, and keeps it as an artifact. */
  packAnimationArchive(
    sourceId: string,
    inside: string | undefined,
    request: AnimationPackRequest,
  ): Promise<WorkspaceArtifact>;
  /** Zips files a tool built in the page and keeps the archive as an artifact. */
  exportFilesAsZip(
    sourceId: string,
    name: string,
    files: { name: string; data: ArrayBuffer }[],
  ): Promise<WorkspaceArtifact>;
  /** Packs the image again with the given frames replaced, and keeps the result as an artifact. */
  packSplashImage(
    sourceId: string,
    inside: string | undefined,
    replacements: SplashReplacementRequest[],
    resolution?: { width: number; height: number },
  ): Promise<WorkspaceArtifact>;
  browseFilesystem(sourceId: string, path: string, inside?: string): Promise<FilesystemListing>;
  /** Keeps a file read out of a filesystem image as an artifact, so a tool can open it. */
  extractFilesystemFileAs(sourceId: string, path: string, inside?: string): Promise<WorkspaceArtifact>;
  /** Opens an artifact as a source of its own, which is how a tool takes a zip out of an image. */
  openArtifactSource(artifactId: string): Promise<WorkspaceSourceRecord>;
  /** Reads one file out of a filesystem image. */
  readFilesystemFile(sourceId: string, path: string, inside?: string): Promise<Uint8Array>;
  digestArtifact(id: string): Promise<string>;
  /** Closes a source and everything that was derived from it. */
  closeSource(sourceId: string): Promise<void>;
}
