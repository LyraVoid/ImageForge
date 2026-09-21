import { VerificationError } from "../../errors";
import type { PatchResult, PatchRunContext, PatchVerificationResult } from "../types";
import type { PatchEngineDeps } from "./planner";
import { resolvePlanArtifact } from "./resolver";

export async function verifyPatchResult(
  deps: PatchEngineDeps,
  result: PatchResult,
  context: PatchRunContext = {},
): Promise<PatchVerificationResult> {
  const provider = deps.providers.get(result.plan.providerId);
  if (!provider) {
    throw new VerificationError("Provider " + result.plan.providerId + " cannot verify this result.");
  }
  const resolved = await resolvePlanArtifact(deps, result.plan);
  const verified = await provider.verify(result, context);
  return { ...verified, artifactSha256: resolved.artifact.sha256 };
}
