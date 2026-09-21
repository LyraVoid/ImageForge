import type { ArtifactRegistry } from "../../artifacts/registry";
import { evaluateCompatibility } from "../../compat/engine";
import { IncompatibleProviderError } from "../../errors";
import type { ParsedImage } from "../../image";
import type { ProviderRegistry } from "../providers/registry";
import type { PatchOptions, PatchPlan } from "../types";
import { resolvePlanArtifact } from "./resolver";

export interface PatchEngineDeps {
  providers: ProviderRegistry;
  artifacts: ArtifactRegistry;
}

export interface PlanRequest {
  image: ParsedImage;
  sourceImageSha256: string;
  providerId: string;
  options: PatchOptions;
  /** Payload names the run will carry, so the plan can pin them. */
  attachmentNames?: string[];
}

export async function planPatch(deps: PatchEngineDeps, request: PlanRequest): Promise<PatchPlan> {
  const provider = deps.providers.get(request.providerId);
  if (!provider) {
    throw new IncompatibleProviderError(
      "Provider " + request.providerId + " has no implementation in this build.",
      "This patch method is not implemented yet.",
    );
  }

  const compatibility = evaluateCompatibility({
    image: request.image,
    providers: deps.providers,
    artifacts: deps.artifacts,
  });
  const candidate = compatibility.candidates.find((entry) => entry.providerId === request.providerId);
  if (candidate && !candidate.compatible) {
    throw new IncompatibleProviderError(
      candidate.providerId + ": " + candidate.reasons.join(" "),
      "This patch method is not compatible with the selected image.",
    );
  }

  const plan = await provider.resolve(request.image, request.options, request.sourceImageSha256, {
    ...(request.attachmentNames === undefined ? {} : { attachmentNames: request.attachmentNames }),
  });
  await resolvePlanArtifact(deps, plan);
  return plan;
}
