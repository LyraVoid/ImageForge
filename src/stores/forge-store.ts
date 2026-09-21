import { create } from "zustand";
import { toImageForgeError } from "@/core/errors";
import type {
  ImageForgeErrorJson,
  PatchOptions,
  PatchPlan,
  PatchProgressEvent,
  PatchVerificationResult,
} from "@/core";
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

export interface KpmFile {
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
  analysis: AnalyzeResponse | null;
  selectedProviderId: string | null;
  planResponse: PlanResponse | null;
  providerOptions: PatchOptions | null;
  kpmFiles: KpmFile[];
  progress: PatchProgressEvent | null;
  output: ForgeOutput | null;
  error: ImageForgeErrorJson | null;
  analyzeFile: (file: File) => Promise<AnalyzeResponse | null>;
  selectProvider: (providerId: string, options?: PatchOptions) => Promise<PatchPlan | null>;
  runPatch: () => Promise<boolean>;
  cancelPatch: () => Promise<void>;
  reset: () => Promise<void>;
  dismissError: () => void;
  setKpmFiles: (files: KpmFile[]) => Promise<void>;
}

export const useForgeStore = create<ForgeState>((set, get) => ({
  stage: "empty",
  workerMode: null,
  isBusy: false,
  cancelRequested: false,
  file: null,
  analysis: null,
  selectedProviderId: null,
  planResponse: null,
  providerOptions: null,
  kpmFiles: [],
  progress: null,
  output: null,
  error: null,

  analyzeFile: async (file) => {
    const active = getClient();
    set({
      stage: "analyzing",
      isBusy: true,
      workerMode: active.mode,
      error: null,
      file,
      analysis: null,
      selectedProviderId: null,
      planResponse: null,
      progress: null,
      output: null,
      cancelRequested: false,
    });
    try {
      const buffer = await file.arrayBuffer();
      const analysis = await active.analyze(buffer, file.name);
      set({ analysis, stage: "analyzed", isBusy: false });
      return analysis;
    } catch (error) {
      set({ error: toImageForgeError(error).toJSON(), stage: "error", isBusy: false });
      return null;
    }
  },

  selectProvider: async (providerId, options) => {
    const active = getClient();
    const previous = get().planResponse;
    // Re-planning the same provider (for example when an output option changes) keeps the
    // current plan on screen instead of blanking the page while the worker runs.
    const keepPrevious = previous !== null && previous.plan.providerId === providerId;
    set({
      stage: "planning",
      isBusy: true,
      error: null,
      selectedProviderId: providerId,
      planResponse: keepPrevious ? previous : null,
      providerOptions: options ?? null,
      output: null,
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
      progress: { stage: "analyze", progress: 0, message: "Preparing" },
    });
    try {
      const attachments = state.kpmFiles.map((file) => ({
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
        progress: { stage: "complete", progress: 100, message: "Patch complete" },
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
      analysis: null,
      selectedProviderId: null,
      planResponse: null,
      providerOptions: null,
      kpmFiles: [],
      progress: null,
      output: null,
      error: null,
    });
  },

  setKpmFiles: async (files) => {
    set({ kpmFiles: files, error: null });
    const state = get();
    if (!state.selectedProviderId) return;
    const names = files.map((file) => file.name).join(",");
    void state.selectProvider(state.selectedProviderId, {
      configuration: { ...(state.providerOptions?.configuration ?? {}), kpmModules: names },
    });
  },

  dismissError: () => set({ error: null, stage: get().planResponse ? "planned" : get().analysis ? "analyzed" : "empty" }),
}));
