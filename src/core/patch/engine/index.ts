import { createArtifactRegistry } from "../../artifacts/registry";
import type { ArtifactRegistry } from "../../artifacts/registry";
import { evaluateCompatibility } from "../../compat/engine";
import type { CompatibilityResult } from "../../compat/types";
import { sha256Hex } from "../../hash";
import { parseImage, toAndroidImage } from "../../image";
import type { AndroidImage, ImageVerification, ParsedImage } from "../../image";
import { createProviderRegistry, ProviderRegistry } from "../providers/registry";
import type { PatchOptions, PatchPlan, PatchResult, PatchRunContext, PatchVerificationResult } from "../types";
import { executePatch } from "./executor";
import type { PatchEngineDeps, PlanRequest } from "./planner";
import { planPatch } from "./planner";
import { verifyPatchResult } from "./verifier";

export type { PatchEngineDeps, PlanRequest } from "./planner";
export { executePatch } from "./executor";
export { planPatch } from "./planner";
export { resolvePlanArtifact } from "./resolver";
export { verifyPatchResult } from "./verifier";

export interface AnalyzedImage {
  image: ParsedImage;
  android: AndroidImage;
  sha256: string;
  compatibility: CompatibilityResult;
}

export interface PatchRunOutcome {
  plan: PatchPlan;
  result: PatchResult;
  verification: PatchVerificationResult;
}

export interface PatchEngineOptions {
  providers?: ProviderRegistry;
  artifacts?: ArtifactRegistry;
}

export class PatchEngine {
  readonly providers: ProviderRegistry;
  readonly artifacts: ArtifactRegistry;

  constructor(options: PatchEngineOptions = {}) {
    this.artifacts = options.artifacts ?? createArtifactRegistry();
    this.providers = options.providers ?? createProviderRegistry(this.artifacts);
  }

  get deps(): PatchEngineDeps {
    return { providers: this.providers, artifacts: this.artifacts };
  }

  compatibility(image: ParsedImage): CompatibilityResult {
    return evaluateCompatibility({ image, providers: this.providers, artifacts: this.artifacts });
  }

  async analyze(bytes: Uint8Array): Promise<AnalyzedImage> {
    const image = parseImage(bytes);
    return {
      image,
      android: toAndroidImage(image),
      sha256: await sha256Hex(bytes),
      compatibility: this.compatibility(image),
    };
  }

  plan(request: PlanRequest): Promise<PatchPlan> {
    return planPatch(this.deps, request);
  }

  execute(image: ParsedImage, plan: PatchPlan, context?: PatchRunContext): Promise<PatchResult> {
    return executePatch(this.deps, image, plan, context);
  }

  verify(result: PatchResult, context?: PatchRunContext): Promise<PatchVerificationResult> {
    return verifyPatchResult(this.deps, result, context);
  }

  async run(
    image: ParsedImage,
    sourceImageSha256: string,
    providerId: string,
    options: PatchOptions,
    context: PatchRunContext = {},
  ): Promise<PatchRunOutcome> {
    const runContext: PatchRunContext = { ...context, options };
    const plan = await this.plan({ image, sourceImageSha256, providerId, options });
    const result = await this.execute(image, plan, runContext);
    const verification = await this.verify(result, runContext);
    runContext.onProgress?.({ stage: "complete", progress: 100, message: "Patch complete" });
    return { plan, result, verification };
  }
}

export function createPatchEngine(options: PatchEngineOptions = {}): PatchEngine {
  return new PatchEngine(options);
}

export type { ImageVerification };
