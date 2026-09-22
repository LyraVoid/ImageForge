import { ArtifactError } from "../../errors";
import type { ArtifactIntegrity, ArtifactRegistry } from "../../artifacts/registry";
import type { PatchArtifact } from "../../artifacts/types";
import type { PatchPlan } from "../types";

export interface ResolvedPlanArtifact {
  artifact: PatchArtifact;
  release: string;
  integrity: ArtifactIntegrity;
}

export interface ResolverDeps {
  artifacts: ArtifactRegistry;
}

/** A plan whose artifact travels with the run instead of coming from the registry. */
export const ATTACHMENT_SOURCE_PREFIX = "attachment:";

export async function resolvePlanArtifact(deps: ResolverDeps, plan: PatchPlan): Promise<ResolvedPlanArtifact> {
  if (plan.artifact.source?.startsWith(ATTACHMENT_SOURCE_PREFIX) === true) {
    // Nothing to look up: the bytes come with the run, the plan pins the attachment name, and the
    // provider reports the digest it read from them.
    return {
      artifact: plan.artifact,
      release: plan.release,
      integrity: {
        ok: true,
        expectedSha256: plan.artifact.sha256,
        actualSha256: plan.artifact.sha256 ?? "",
        sizeBytes: plan.artifact.sizeBytes ?? 0,
      },
    };
  }

  const resolved = deps.artifacts.resolve({
    providerId: plan.providerId,
    release: plan.release,
    artifactId: plan.artifact.id,
    architecture: plan.architecture === "unknown" ? undefined : plan.architecture,
  });
  const integrity = await deps.artifacts.verifyIntegrity(resolved.artifact);
  if (!integrity.ok) {
    throw new ArtifactError(
      "Artifact " +
        resolved.artifact.id +
        " expected SHA-256 " +
        String(integrity.expectedSha256) +
        " but hashed to " +
        integrity.actualSha256 +
        ".",
      "The selected artifact failed its integrity check.",
    );
  }
  return { artifact: resolved.artifact, release: resolved.release.release, integrity };
}
