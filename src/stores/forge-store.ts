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
import type { FilesystemListing, PartitionView, WorkspaceSourceRecord } from "@/workers/protocol";
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
  /** Hands an artifact to the patcher; named without a leading "use" so it is not mistaken for a hook. */
  sendToPatcher: (artifactId: string) => Promise<AnalyzeResponse | null>;
  readArtifactBytes: (artifactId: string) => Promise<Uint8Array | null>;
  inspectPartition: () => Promise<PartitionView | null>;
  unpackSparse: () => Promise<WorkspaceArtifact | null>;
  extractLogicalPartition: (partitionName: string) => Promise<WorkspaceArtifact | null>;
  browseFilesystem: (path: string) => Promise<FilesystemListing | null>;
  extractFilesystemFile: (path: string) => Promise<Uint8Array | null>;
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

  inspectPartition: async () => {
    const state = get();
    if (!state.source) return null;
    try {
      const view = await getClient().inspectPartition(state.source.id);
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
      const listing = await getClient().browseFilesystem(state.source.id, path);
      set({ filesystemListing: listing, error: null });
      return listing;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON(), filesystemListing: null });
      return null;
    }
  },

  extractFilesystemFile: async (path) => {
    const state = get();
    if (!state.source) return null;
    try {
      const bytes = await getClient().readFilesystemFile(state.source.id, path);
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
      analysis: null,
      selectedProviderId: null,
      planResponse: null,
      providerOptions: null,
      attachments: [],
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
