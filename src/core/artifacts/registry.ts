import { ArtifactError } from "../errors";
import { sha256Hex } from "../hash";
import { ARTIFACT_CATALOG, MOCK_ARTIFACT_PAYLOAD } from "./catalog";
import type { ArtifactCatalog, ArtifactRelease, PatchArtifact } from "./types";

export interface ResolveArtifactRequest {
  providerId: string;
  release?: string;
  artifactId?: string;
  architecture?: string;
}

export interface ResolvedArtifact {
  artifact: PatchArtifact;
  release: ArtifactRelease;
}

export interface ArtifactIntegrity {
  ok: boolean;
  expectedSha256: string | undefined;
  actualSha256: string;
  sizeBytes: number;
}

export class ArtifactRegistry {
  readonly catalog: ArtifactCatalog;

  constructor(catalog: ArtifactCatalog = ARTIFACT_CATALOG) {
    this.catalog = catalog;
  }

  releases(providerId?: string): ArtifactRelease[] {
    if (!providerId) return this.catalog.releases;
    return this.catalog.releases.filter((release) => release.providerId === providerId);
  }

  latestRelease(providerId: string): ArtifactRelease | undefined {
    return this.releases(providerId).at(-1);
  }

  listArtifacts(providerId: string, release?: string): PatchArtifact[] {
    const releases = this.releases(providerId).filter((entry) => !release || entry.release === release);
    return releases.flatMap((entry) => entry.artifacts);
  }

  resolve(request: ResolveArtifactRequest): ResolvedArtifact {
    const releases = this.releases(request.providerId);
    if (releases.length === 0) {
      throw new ArtifactError(
        "No artifact release is registered for provider " + request.providerId + ".",
        "No artifact registry entry is available for this patch method yet.",
      );
    }
    const release = request.release
      ? releases.find((entry) => entry.release === request.release)
      : releases.at(-1);
    if (!release) {
      throw new ArtifactError("Release " + request.release + " is not registered for " + request.providerId + ".");
    }
    const candidates = release.artifacts.filter(
      (artifact) =>
        (!request.artifactId || artifact.id === request.artifactId) &&
        (!request.architecture || !artifact.architecture || artifact.architecture === request.architecture),
    );
    const artifact = candidates.at(0);
    if (!artifact) {
      throw new ArtifactError(
        "No artifact matched " + JSON.stringify(request) + " in release " + release.release + ".",
      );
    }
    return { artifact, release };
  }

  async loadPayload(artifact: PatchArtifact): Promise<Uint8Array> {
    if (artifact.source === "builtin:mock") {
      return new TextEncoder().encode(MOCK_ARTIFACT_PAYLOAD);
    }
    throw new ArtifactError(
      "Artifact source " + String(artifact.source) + " cannot be fetched: remote artifact downloads are not implemented in this build.",
      "Downloading upstream artifacts is not available in this build.",
    );
  }

  async verifyIntegrity(artifact: PatchArtifact): Promise<ArtifactIntegrity> {
    const payload = await this.loadPayload(artifact);
    const actualSha256 = await sha256Hex(payload);
    return {
      ok: artifact.sha256 === undefined || artifact.sha256 === actualSha256,
      expectedSha256: artifact.sha256,
      actualSha256,
      sizeBytes: payload.length,
    };
  }
}

export function createArtifactRegistry(catalog?: ArtifactCatalog): ArtifactRegistry {
  return new ArtifactRegistry(catalog);
}
