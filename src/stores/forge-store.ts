import { create } from "zustand";
import { toImageForgeError } from "@/core/errors";
import type { MessageKey } from "@/i18n";
import { currentTranslator } from "./locale-store";
import type {
  ImageForgeErrorJson,
  PatchOptions,
  PatchPlan,
  PatchProgressEvent,
  PatchVerificationResult,
} from "@/core";
import type { OpenedPackage } from "@/core/package";
import type { WorkspaceArtifact } from "@/core/workspace";
import type {
  AnimationSummary,
  DiffSummary,
  FilesystemListing,
  PartitionView,
  SplashSummary,
  WorkspaceSourceRecord,
} from "@/workers/protocol";
import {
  parseAnimationDesc,
  serializeAnimationDesc,
  setAnimationGlobal,
  setAnimationPart,
} from "@/core/animation";
import { adaptImage, encodeBmp, encodeMtkPixels, fitRgba } from "@/core/logo";
import type { SplashResolutionMode } from "@/core/logo";

/** A frame the user replaced: adapted, encoded, and previewed at display size. */
export interface SplashReplacement {
  /** The frame as the container stores it: a BMP for splash, raw pixels for a MediaTek logo. */
  payload: Uint8Array;
  /** The adapted pixels, scaled down for display. */
  preview: { width: number; height: number; rgba: Uint8Array };
  mode: SplashResolutionMode;
  fit: string;
  target: { width: number; height: number };
  sourceName: string;
}

/** The longest side of a preview the editor builds in the page. */
const SPLASH_PREVIEW_MAX = 240;
import { mergePlanOptions } from "./plan-options";
import { createPatchWorkerClient } from "@/workers/client";
import type { PatchWorkerClient, WorkerMode } from "@/workers/client";
import type { AnalyzeResponse, PlanResponse } from "@/workers/protocol";

export type ForgeStage =
  | "empty"
  | "analyzing"
  | "analyzed"
  | "planning"
  | "planned"
  | "patching"
  | "patched"
  | "error";

/** A binary payload the user attached: a KernelPatch module or a KernelSU module. */
export interface AttachmentFile {
  name: string;
  bytes: Uint8Array;
}

export interface ForgeOutput {
  plan: PatchPlan;
  sha256: string;
  sizeBytes: number;
  warnings: string[];
  metadata: Record<string, string>;
  verification: PatchVerificationResult;
  blob: Blob;
  fileName: string;
}

let client: PatchWorkerClient | null = null;

/** Progress lines the store itself reports are read at the moment they are produced. */
function message(key: MessageKey): string {
  return currentTranslator()(key);
}

function getClient(): PatchWorkerClient {
  if (!client) client = createPatchWorkerClient();
  return client;
}

function toStandaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export function outputFileName(sourceName: string | undefined): string {
  const name = sourceName && sourceName.trim() !== "" ? sourceName : "boot.img";
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return "patched_" + base + ".img";
}

interface ForgeState {
  stage: ForgeStage;
  workerMode: WorkerMode | null;
  isBusy: boolean;
  cancelRequested: boolean;
  file: File | null;
  /** What the worker found the opened file to be; the patcher only continues for a boot image. */
  source: WorkspaceSourceRecord | null;
  /** What a package holds, once it has been asked; the extract tool lists from this. */
  packageListing: OpenedPackage | null;
  /** Everything tools derived from the current source, in the order it was produced. */
  artifacts: WorkspaceArtifact[];
  /** What the unpack tool found in the current source, once it has looked. */
  partitionView: PartitionView | null;
  /** The directory of a filesystem image the user is looking at. */
  filesystemListing: FilesystemListing | null;
  /** The entry inside the opened package a tool is looking at, when it is not the file itself. */
  insideEntry: string | null;
  /** The splash image the logo tool has open, once its frames have been read. */
  splash: SplashSummary | null;
  /** Small previews of the original frames, by frame index. */
  splashPreviews: Record<number, { width: number; height: number; rgba: Uint8Array }>;
  /** Replacements the user prepared, by frame index. */
  splashReplacements: Record<number, SplashReplacement>;
  splashMode: SplashResolutionMode;
  splashCustomWidth: number | null;
  splashCustomHeight: number | null;
  /**
   * The screen resolution of a MediaTek logo, which its container does not record. Null until the
   * user gives one; the page offers candidates taken from the size of the image's biggest block.
   */
  logoScreen: { width: number; height: number } | null;
  /**
   * A resolution the user gave to one frame whose length the image's own resolution does not explain,
   * by frame index. MediaTek ships small icon blocks whose size is nowhere in the container.
   */
  splashFrameResolutions: Record<string, { width: number; height: number }>;
  analysis: AnalyzeResponse | null;
  selectedProviderId: string | null;
  planResponse: PlanResponse | null;
  providerOptions: PatchOptions | null;
  attachments: AttachmentFile[];
  progress: PatchProgressEvent | null;
  output: ForgeOutput | null;
  error: ImageForgeErrorJson | null;
  analyzeFile: (file: File) => Promise<AnalyzeResponse | null>;
  loadPackage: () => Promise<OpenedPackage | null>;
  extractEntry: (entryId: string) => Promise<WorkspaceArtifact | null>;
  /** Extracts several entries at once, which is what a whole set of partitions wants. */
  extractEntries: (entryIds: string[]) => Promise<WorkspaceArtifact[]>;
  /** Hands an artifact to the patcher; named without a leading "use" so it is not mistaken for a hook. */
  sendToPatcher: (artifactId: string) => Promise<AnalyzeResponse | null>;
  readArtifactBytes: (artifactId: string) => Promise<Uint8Array | null>;
  /** The artifact as a `Blob`: for a streamed partition this is the only copy that exists. */
  artifactBlob: (artifactId: string) => Promise<Blob | null>;
  /** Rewrites an artifact as an Android sparse image and keeps it in the workspace. */
  packSparse: (artifactId: string) => Promise<WorkspaceArtifact | null>;
  /** The boot animation that is open, and the source it came from. */
  animation: AnimationSummary | null;
  animationSourceId: string | null;
  /** Which part the frame strip shows. */
  animationPart: string | null;
  /** Frames the user replaced, by their name inside the archive. */
  animationReplacements: Record<string, { data: Uint8Array; sourceName: string; width: number; height: number }>;
  /** The desc.txt to write. Null while nothing has been edited, which keeps the original byte for byte. */
  animationDescDraft: string | null;
  /** The last comparison, and what it compared. */
  diff: DiffSummary | null;
  diffArtifactId: string | null;
  /** Compares the open source with an artifact of the workspace. */
  compareWithArtifact: (artifactId: string) => Promise<DiffSummary | null>;
  clearDiff: () => void;
  /** Reads the open source as a boot animation: its parts and their frames. */
  loadAnimation: () => Promise<AnimationSummary | null>;
  selectAnimationPart: (path: string) => void;
  /** One frame's bytes, which is what the preview draws. */
  readAnimationFrame: (name: string) => Promise<Uint8Array | null>;
  replaceAnimationFrame: (
    name: string,
    replacement: { data: Uint8Array; sourceName: string; width: number; height: number },
  ) => void;
  clearAnimationReplacement: (name: string) => void;
  /** Edits the animation's own fields; the desc.txt is only rewritten when something changes. */
  editAnimationGlobal: (fields: { width?: number; height?: number; fps?: number }) => void;
  editAnimationPart: (path: string, fields: { count?: number; pause?: number; type?: string }) => void;
  /** Writes the animation again, keeping every frame the user did not touch. */
  packAnimation: () => Promise<WorkspaceArtifact | null>;
  /** Lays several artifacts out as a super image, the way AOSP's lpmake does. */
  packSuper: (request: {
    artifactIds: string[];
    deviceSize?: number;
    alignment?: number;
    metadataOnly?: boolean;
  }) => Promise<WorkspaceArtifact | null>;
  /** Points the tools at one entry inside the opened package, or at the file itself (null). */
  openInside: (entryId: string | null) => void;
  inspectPartition: () => Promise<PartitionView | null>;
  /** Reads the open image as a splash image and lists its frames. */
  loadSplash: () => Promise<SplashSummary | null>;
  /** A frame's small preview, read once and kept. */
  readSplashFramePreview: (index: number) => Promise<{ width: number; height: number; rgba: Uint8Array } | null>;
  /** Adapts and encodes an image for one frame, so the packer only has to place it. */
  replaceSplashFrame: (
    index: number,
    source: { name: string; rgba: Uint8Array; width: number; height: number },
  ) => SplashReplacement | null;
  /**
   * Replaces several frames at once, matching each picture to the frame whose name it carries (the
   * file name without its extension, case insensitive). Returns what matched and what did not.
   */
  replaceSplashFramesFromFiles: (
    files: { name: string; rgba: Uint8Array; width: number; height: number }[],
  ) => { matched: string[]; unmatched: string[] };
  clearSplashReplacement: (index: number) => void;
  setSplashMode: (mode: SplashResolutionMode, custom?: { width?: number; height?: number }) => void;
  /** Says what the screen is, which is what a MediaTek logo needs before it can be read. */
  setLogoScreen: (screen: { width: number; height: number }) => Promise<void>;
  /** Gives one frame its own size, for a block the screen resolution does not explain. */
  setSplashFrameResolution: (index: number, size: { width: number; height: number }) => Promise<void>;
  /** Packs the image with every replacement in place, and keeps the result as an artifact. */
  packSplash: () => Promise<WorkspaceArtifact | null>;
  /** Exports every frame as the BMP the device stores, plus a manifest, in one archive. */
  exportSplashFrames: () => Promise<WorkspaceArtifact | null>;
  unpackSparse: () => Promise<WorkspaceArtifact | null>;
  extractLogicalPartition: (partitionName: string) => Promise<WorkspaceArtifact | null>;
  browseFilesystem: (path: string) => Promise<FilesystemListing | null>;
  extractFilesystemFile: (path: string) => Promise<Uint8Array | null>;
  /** Keeps a file out of a filesystem image as an artifact and opens it as a source of its own. */
  openFilesystemFile: (path: string) => Promise<WorkspaceSourceRecord | null>;
  /**
   * Opens an artifact as a source of its own, without treating it as an image. That is how a boot
   * animation, which lives inside a filesystem image, becomes something the animation tool opens.
   */
  openArtifactAsSource: (artifactId: string) => Promise<WorkspaceSourceRecord | null>;
  selectProvider: (providerId: string, options?: PatchOptions) => Promise<PatchPlan | null>;
  runPatch: () => Promise<boolean>;
  cancelPatch: () => Promise<void>;
  reset: () => Promise<void>;
  dismissError: () => void;
  setAttachments: (files: AttachmentFile[]) => Promise<void>;
}

export const useForgeStore = create<ForgeState>((set, get) => ({
  stage: "empty",
  workerMode: null,
  isBusy: false,
  cancelRequested: false,
  file: null,
  source: null,
  packageListing: null,
  artifacts: [],
  partitionView: null,
  filesystemListing: null,
  insideEntry: null,
  splash: null,
  splashPreviews: {},
  splashReplacements: {},
  diff: null,
  diffArtifactId: null,
  animation: null,
  animationSourceId: null,
  animationPart: null,
  animationReplacements: {},
  animationDescDraft: null,
  splashMode: "followOriginal",
  splashCustomWidth: null,
  splashCustomHeight: null,
  logoScreen: null,
  splashFrameResolutions: {},
  analysis: null,
  selectedProviderId: null,
  planResponse: null,
  providerOptions: null,
  attachments: [],
  progress: null,
  output: null,
  error: null,

  /**
   * Opens a file into the worker's workspace and asks what it is. A boot image continues into the
   * patcher; anything else stays in the workspace for the tool that accepts it, which the picker
   * lists (see the tools registry).
   */
  analyzeFile: async (file) => {
    const active = getClient();
    set({
      stage: "analyzing",
      isBusy: true,
      workerMode: active.mode,
      error: null,
      file,
      source: null,
      packageListing: null,
      artifacts: [],
      partitionView: null,
      filesystemListing: null,
      insideEntry: null,
      analysis: null,
      selectedProviderId: null,
      planResponse: null,
      progress: null,
      output: null,
      cancelRequested: false,
    });
    try {
      // The File itself is handed over: it is a handle to disk, so a multi gigabyte package is
      // never read into the main thread's heap.
      const source = await active.openSource(file, file.name);
      set({ source });
      if (source.kind !== "boot-container") {
        set({ stage: "empty", isBusy: false });
        return null;
      }
      const analysis = await active.analyzeSource(source.id);
      set({ analysis, stage: "analyzed", isBusy: false });
      return analysis;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON(), stage: "error", isBusy: false });
      return null;
    }
  },

  /** Lists what the current source holds; only a package has anything to list. */
  loadPackage: async () => {
    const state = get();
    if (!state.source) return null;
    try {
      const listing = await getClient().listPackage(state.source.id);
      set({ packageListing: listing, error: null });
      return listing;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  extractEntries: async (entryIds) => {
    const state = get();
    if (!state.source) return [];
    try {
      const artifacts = await getClient().extractEntries(state.source.id, entryIds);
      set({ artifacts: [...get().artifacts, ...artifacts], error: null });
      return artifacts;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return [];
    }
  },

  extractEntry: async (entryId) => {
    const state = get();
    if (!state.source) return null;
    try {
      const artifact = await getClient().extractPackageEntry(state.source.id, entryId);
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  /** Hands an extracted artifact to the patcher; the bytes stay where they are. */
  sendToPatcher: async (artifactId) => {
    try {
      const analysis = await getClient().analyzeArtifact(artifactId);
      set({ analysis, stage: "analyzed", error: null });
      return analysis;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  openInside: (entryId) => {
    // A different thing to look at: the views below are rebuilt from scratch.
    set({ insideEntry: entryId, partitionView: null, filesystemListing: null, error: null });
  },

  inspectPartition: async () => {
    const state = get();
    if (!state.source) return null;
    try {
      const view = await getClient().inspectPartition(state.source.id, state.insideEntry ?? undefined);
      set({ partitionView: view, filesystemListing: null, error: null });
      if (view.kind === "erofs" || view.kind === "ext4") await get().browseFilesystem("/");
      return view;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  unpackSparse: async () => {
    const state = get();
    if (!state.source) return null;
    try {
      const artifact = await getClient().unpackSparseSource(state.source.id);
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  extractLogicalPartition: async (partitionName) => {
    const state = get();
    if (!state.source) return null;
    try {
      const artifact = await getClient().extractLogicalPartition(state.source.id, partitionName);
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  browseFilesystem: async (path) => {
    const state = get();
    if (!state.source) return null;
    try {
      const listing = await getClient().browseFilesystem(state.source.id, path, state.insideEntry ?? undefined);
      set({ filesystemListing: listing, error: null });
      return listing;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON(), filesystemListing: null });
      return null;
    }
  },

  openArtifactAsSource: async (artifactId) => {
    try {
      const record = await getClient().openArtifactSource(artifactId);
      set({
        source: record,
        insideEntry: null,
        // a source that was opened rather than analyzed: tools that read it do their own parsing
        stage: "empty",
        analysis: null,
        partitionView: null,
        filesystemListing: null,
        error: null,
      });
      return record;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  openFilesystemFile: async (path) => {
    const state = get();
    if (!state.source) return null;
    try {
      const artifact = await getClient().extractFilesystemFileAs(
        state.source.id,
        path,
        state.insideEntry ?? undefined,
      );
      set({ artifacts: [...get().artifacts, artifact], error: null });
      // and straight into a tool, so nothing has to be downloaded and dropped again
      return get().openArtifactAsSource(artifact.id);
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  extractFilesystemFile: async (path) => {
    const state = get();
    if (!state.source) return null;
    try {
      const bytes = await getClient().readFilesystemFile(state.source.id, path, state.insideEntry ?? undefined);
      const name = path.split("/").filter((part) => part !== "").pop() ?? "file";
      const artifact = await getClient().registerArtifact({
        sourceId: state.source.id,
        parentId: state.source.id,
        tool: "unpack",
        name,
        params: { path },
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      });
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return bytes;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  loadSplash: async () => {
    const state = get();
    if (!state.source) return null;
    try {
      const summary = await getClient().inspectSplash(
        state.source.id,
        state.insideEntry ?? undefined,
        state.logoScreen ?? undefined,
        state.splashFrameResolutions,
      );
      set({ splash: summary, splashPreviews: {}, splashReplacements: {}, error: null });
      return summary;
    } catch (error) {
      set({ splash: null, error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  readSplashFramePreview: async (index) => {
    const state = get();
    if (!state.source) return null;
    const cached = state.splashPreviews[index];
    if (cached) return cached;
    try {
      const preview = await getClient().readSplashFramePreview(
        state.source.id,
        state.insideEntry ?? undefined,
        index,
        state.logoScreen ?? undefined,
        state.splashFrameResolutions,
      );
      const value = {
        width: preview.width,
        height: preview.height,
        rgba: new Uint8Array(preview.rgba),
      };
      set({ splashPreviews: { ...get().splashPreviews, [index]: value } });
      return value;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  replaceSplashFrame: (index, source) => {
    const state = get();
    const frame = state.splash?.frames[index];
    if (!frame) return null;
    try {
      const adapted = adaptImage(source.rgba, source.width, source.height, {
        mode: state.splashMode,
        frame: {
          index: frame.index,
          name: frame.name,
          offset: 0,
          realSize: frame.realSize,
          compressedSize: frame.compressedSize,
        },
        image: { width: source.width, height: source.height },
        originalWidth: frame.width,
        originalHeight: frame.height,
        customWidth: state.splashCustomWidth ?? undefined,
        customHeight: state.splashCustomHeight ?? undefined,
      });
      // A MediaTek logo stores raw pixels in the frame's own layout; a splash frame stores a BMP.
      const payload =
        state.splash?.format === "mtk-logo"
          ? frame.layout
            ? encodeMtkPixels(adapted.rgba, {
                bytesPerPixel: frame.layout.bytesPerPixel,
                stride: frame.layout.stride,
                prefixBytes: frame.layout.prefixBytes,
                width: frame.width,
                height: frame.height,
              })
            : null
          : encodeBmp(adapted.rgba, adapted.width, adapted.height, {
              // keep the vendor's own header details: the resolution field and any trailing bytes
              pixelsPerMeter: frame.pixelsPerMeter,
              trailingBytes: frame.trailingBytes,
            });
      if (!payload) {
        set({ error: toImageForgeError(new Error("This block's resolution is unknown.")).toJSON() });
        return null;
      }
      const scale = Math.min(1, SPLASH_PREVIEW_MAX / Math.max(adapted.width, adapted.height));
      const preview = fitRgba(
        adapted.rgba,
        adapted.width,
        adapted.height,
        Math.max(1, Math.round(adapted.width * scale)),
        Math.max(1, Math.round(adapted.height * scale)),
        "stretch",
      );
      const replacement: SplashReplacement = {
        payload,
        preview: { width: preview.width, height: preview.height, rgba: preview.rgba },
        mode: state.splashMode,
        fit: adapted.fit,
        target: adapted.target,
        sourceName: source.name,
      };
      set({ splashReplacements: { ...get().splashReplacements, [index]: replacement }, error: null });
      return replacement;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  replaceSplashFramesFromFiles: (files) => {
    const summary = get().splash;
    const matched: string[] = [];
    const unmatched: string[] = [];
    if (!summary) return { matched, unmatched: files.map((file) => file.name) };
    for (const file of files) {
      const base = file.name.replace(/\.[^.]+$/, "").trim().toLowerCase();
      const frame = summary.frames.find((candidate) => candidate.name.trim().toLowerCase() === base);
      if (!frame) {
        unmatched.push(file.name);
        continue;
      }
      const replacement = get().replaceSplashFrame(frame.index, file);
      if (replacement) matched.push(frame.name.trim());
      else unmatched.push(file.name);
    }
    return { matched, unmatched };
  },

  clearSplashReplacement: (index) => {
    const next = { ...get().splashReplacements };
    delete next[index];
    set({ splashReplacements: next });
  },

  setLogoScreen: async (screen) => {
    set({ logoScreen: screen, splash: null, splashPreviews: {} });
    await get().loadSplash();
  },

  setSplashFrameResolution: async (index, size) => {
    set({ splashFrameResolutions: { ...get().splashFrameResolutions, [String(index)]: size }, splashPreviews: {} });
    // re-reading the image with the new size is what gives that frame a layout
    await get().loadSplash();
  },

  setSplashMode: (mode, custom) => {
    set({
      splashMode: mode,
      splashCustomWidth: custom?.width ?? get().splashCustomWidth,
      splashCustomHeight: custom?.height ?? get().splashCustomHeight,
    });
  },

  packSplash: async () => {
    const state = get();
    if (!state.source || !state.splash) return null;
    try {
      const replacements = Object.entries(state.splashReplacements).map(([index, replacement]) => ({
        index: Number(index),
        payload: replacement.payload.buffer.slice(
          replacement.payload.byteOffset,
          replacement.payload.byteOffset + replacement.payload.byteLength,
        ) as ArrayBuffer,
      }));
      const artifact = await getClient().packSplashImage(
        state.source.id,
        state.insideEntry ?? undefined,
        replacements,
        state.logoScreen ?? undefined,
        state.splashFrameResolutions,
      );
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  exportSplashFrames: async () => {
    const state = get();
    if (!state.source || !state.splash) return null;
    try {
      const files: { name: string; data: ArrayBuffer }[] = [];
      for (const frame of state.splash.frames) {
        const bmp = await getClient().readSplashFrameBmp(
          state.source.id,
          state.insideEntry ?? undefined,
          frame.index,
        );
        const safe = frame.name.trim().replace(/[^A-Za-z0-9._-]+/g, "_") || String(frame.index);
        // a splash frame is a BMP; a MediaTek block is raw pixels, in the layout the manifest names
        const extension = state.splash?.format === "mtk-logo" ? ".raw" : ".bmp";
        files.push({ name: "frames/" + safe + extension, data: bmp });
      }
      const manifest = {
        format: state.splash.format,
        headerWidth: state.splash.headerWidth,
        headerHeight: state.splash.headerHeight,
        sizeBytes: state.splash.sizeBytes,
        frames: state.splash.frames.map((frame) => ({
          index: frame.index,
          name: frame.name.trim(),
          width: frame.width,
          height: frame.height,
          realSize: frame.realSize,
          compressedSize: frame.compressedSize,
          ...(frame.layout === undefined ? {} : { layout: frame.layout }),
        })),
      };
      files.push({
        name: "manifest.json",
        data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n")
          .buffer as ArrayBuffer,
      });
      const base = (state.source.name || "splash.img").replace(/\.img$/, "");
      const artifact = await getClient().exportFilesAsZip(state.source.id, base + "-frames.zip", files);
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  artifactBlob: async (artifactId) => {
    try {
      return await getClient().artifactBlob(artifactId);
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  packSparse: async (artifactId) => {
    try {
      const artifact = await getClient().packSparseArtifact(artifactId);
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  compareWithArtifact: async (artifactId) => {
    const state = get();
    if (!state.source) return null;
    try {
      const summary = await getClient().compareWithArtifact(
        state.source.id,
        state.insideEntry ?? undefined,
        artifactId,
      );
      set({ diff: summary, diffArtifactId: artifactId, error: null });
      return summary;
    } catch (error) {
      set({ diff: null, error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  clearDiff: () => set({ diff: null, diffArtifactId: null }),

  loadAnimation: async () => {
    const state = get();
    if (!state.source) return null;
    try {
      const summary = await getClient().inspectAnimation(state.source.id, state.insideEntry ?? undefined);
      set({
        animation: summary,
        animationSourceId: state.source.id,
        animationPart: summary.parts[0]?.path ?? null,
        animationReplacements: {},
        animationDescDraft: null,
        error: null,
      });
      return summary;
    } catch (error) {
      set({
        animation: null,
        animationSourceId: state.source.id,
        error: toImageForgeError(error).toJSON(),
      });
      return null;
    }
  },

  selectAnimationPart: (path) => set({ animationPart: path }),

  readAnimationFrame: async (name) => {
    const state = get();
    if (!state.source) return null;
    try {
      return new Uint8Array(
        await getClient().readAnimationFrame(state.source.id, state.insideEntry ?? undefined, name),
      );
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  replaceAnimationFrame: (name, replacement) => {
    set({ animationReplacements: { ...get().animationReplacements, [name]: replacement }, error: null });
  },

  clearAnimationReplacement: (name) => {
    const next = { ...get().animationReplacements };
    delete next[name];
    set({ animationReplacements: next });
  },

  editAnimationGlobal: (fields) => {
    const state = get();
    if (!state.animation) return;
    try {
      const model = parseAnimationDesc(state.animationDescDraft ?? state.animation.desc);
      setAnimationGlobal(model, fields);
      const desc = serializeAnimationDesc(model);
      set({
        animationDescDraft: desc,
        animation: { ...state.animation, width: model.width, height: model.height, fps: model.fps, desc },
        error: null,
      });
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
    }
  },

  editAnimationPart: (path, fields) => {
    const state = get();
    if (!state.animation) return;
    try {
      const model = parseAnimationDesc(state.animationDescDraft ?? state.animation.desc);
      setAnimationPart(model, path, fields);
      const desc = serializeAnimationDesc(model);
      set({ animationDescDraft: desc, animation: { ...state.animation, desc }, error: null });
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
    }
  },

  packAnimation: async () => {
    const state = get();
    if (!state.source || !state.animation) return null;
    try {
      const replacements = Object.entries(state.animationReplacements).map(([name, replacement]) => ({
        name,
        data: replacement.data.buffer.slice(
          replacement.data.byteOffset,
          replacement.data.byteOffset + replacement.data.byteLength,
        ) as ArrayBuffer,
      }));
      const artifact = await getClient().packAnimationArchive(
        state.source.id,
        state.insideEntry ?? undefined,
        { desc: state.animationDescDraft ?? undefined, replacements },
      );
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  packSuper: async (request) => {
    try {
      const artifacts = get().artifacts.filter((artifact) => request.artifactIds.includes(artifact.id));
      const artifact = await getClient().packSuperImage({
        partitions: artifacts.map((entry) => ({ artifactId: entry.id })),
        deviceSize: request.deviceSize,
        alignment: request.alignment,
        metadataOnly: request.metadataOnly,
        groups: [{ name: "main", maximumSize: request.deviceSize ?? 0 }],
      });
      set({ artifacts: [...get().artifacts, artifact], error: null });
      return artifact;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  readArtifactBytes: async (artifactId) => {
    try {
      return new Uint8Array(await getClient().readArtifact(artifactId));
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON() });
      return null;
    }
  },

  selectProvider: async (providerId, options) => {
    const active = getClient();
    const previous = get().planResponse;
    // Re-planning the same provider (for example when an output option changes) keeps the
    // current plan on screen instead of blanking the page while the worker runs.
    const keepPrevious = previous !== null && previous.plan.providerId === providerId;
    const attachments = get().attachments;
    set({
      stage: "planning",
      isBusy: true,
      error: null,
      selectedProviderId: providerId,
      planResponse: keepPrevious ? previous : null,
      providerOptions: options ?? null,
      output: null,
      // Payloads belong to the plan that pinned them: a KernelPatch module is meaningless to the
      // KernelSU provider and the other way round.
      ...(keepPrevious || attachments.length === 0 ? {} : { attachments: [] }),
    });
    try {
      const planResponse = await active.plan({ providerId, ...(options === undefined ? {} : { options }) });
      set({ planResponse, stage: "planned", isBusy: false });
      return planResponse.plan;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON(), stage: "error", isBusy: false });
      return null;
    }
  },

  runPatch: async () => {
    const state = get();
    if (!state.selectedProviderId) return false;
    const active = getClient();
    set({
      stage: "patching",
      isBusy: true,
      error: null,
      cancelRequested: false,
      output: null,
      progress: { stage: "analyze", progress: 0, message: message("process.message.preparing") },
    });
    try {
      const attachments = state.attachments.map((file) => ({
        id: file.name,
        name: file.name,
        bytes: toStandaloneBuffer(file.bytes),
      }));
      const response = await active.patch(
        {
          providerId: state.selectedProviderId,
          ...(state.providerOptions === null ? {} : { options: state.providerOptions }),
          ...(attachments.length === 0 ? {} : { attachments }),
        },
        (event) => {
          set({ progress: event });
        },
      );
      const blob = new Blob([response.bytes], { type: "application/octet-stream" });
      const output: ForgeOutput = {
        plan: response.plan,
        sha256: response.sha256,
        sizeBytes: response.sizeBytes,
        warnings: response.warnings,
        metadata: response.metadata,
        verification: response.verification,
        blob,
        fileName: outputFileName(state.file?.name),
      };
      set({
        output,
        stage: "patched",
        isBusy: false,
        cancelRequested: false,
        progress: { stage: "complete", progress: 100, message: message("process.message.complete") },
      });
      return true;
    } catch (error) {
      if (get().cancelRequested) {
        set({
          stage: "planned",
          isBusy: false,
          cancelRequested: false,
          progress: null,
          error: null,
        });
        return false;
      }
      set({ error: toImageForgeError(error).toJSON(), stage: "error", isBusy: false });
      return false;
    }
  },

  cancelPatch: async () => {
    set({ cancelRequested: true });
    try {
      await getClient().cancel();
    } catch {
      // the worker may already be idle; cancellation is best effort
    }
  },

  reset: async () => {
    try {
      await getClient().reset();
    } catch {
      // ignore
    }
    set({
      stage: "empty",
      isBusy: false,
      cancelRequested: false,
      file: null,
      source: null,
      packageListing: null,
      artifacts: [],
      partitionView: null,
      filesystemListing: null,
      insideEntry: null,
      analysis: null,
      selectedProviderId: null,
      planResponse: null,
      providerOptions: null,
      attachments: [],
      splash: null,
      splashPreviews: {},
      splashReplacements: {},
      progress: null,
      output: null,
      error: null,
    });
  },

  setAttachments: async (files) => {
    set({ attachments: files, error: null });
    const state = get();
    if (!state.selectedProviderId) return;
    const names = files.map((file) => file.name).join(",");
    // The current plan is the base so that modules and the options set on the patch page
    // survive each other.
    void state.selectProvider(state.selectedProviderId, {
      configuration: mergePlanOptions(
        state.planResponse?.plan.configuration,
        state.providerOptions?.configuration ?? {},
        { kpmModules: names },
      ),
    });
  },

  dismissError: () => set({ error: null, stage: get().planResponse ? "planned" : get().analysis ? "analyzed" : "empty" }),
}));
