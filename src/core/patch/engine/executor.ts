import { AbortedError, PatchError } from "../../errors";
import { sha256Hex } from "../../hash";
import type { ParsedImage } from "../../image";
import type { PatchPlan, PatchResult, PatchRunContext } from "../types";
import type { PatchEngineDeps } from "./planner";

export async function executePatch(
  deps: PatchEngineDeps,
  image: ParsedImage,
  plan: PatchPlan,
  context: PatchRunContext = {},
): Promise<PatchResult> {
  if (context.signal?.aborted) throw new AbortedError();
  const provider = deps.providers.get(plan.providerId);
  if (!provider) {
    throw new PatchError("Provider " + plan.providerId + " cannot execute this plan.");
  }

  context.onProgress?.({ stage: "analyze", progress: 0, message: "Starting " + provider.name });
  const result = await provider.patch(image, plan, context);
  const recomputed = await sha256Hex(result.bytes);
  if (recomputed !== result.sha256) {
    throw new PatchError(
      "Provider " + provider.id + " reported SHA-256 " + result.sha256 + " but the produced bytes hash to " + recomputed + ".",
    );
  }
  return result;
}
