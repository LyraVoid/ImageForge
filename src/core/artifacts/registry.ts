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

/**
 * Loads the raw bytes behind an artifact source. The default implementation
 * fetches same-origin bundled paths; tests inject a filesystem backed loader.
 */
export type PayloadLoader = (path: string, artifact: PatchArtifact) => Promise<Uint8Array>;

async function fetchPayload(path: string): Promise<Uint8Array> {
  if (typeof fetch === "undefined") {
    throw new ArtifactError("This runtime cannot fetch bundled artifacts.", "fetch() is unavailable.");
  }
  let response: Response;
  try {
    response = await fetch(path);
  } catch (error) {
    throw new ArtifactError(
      "Bundled artifact " + path + " could not be fetched: " + (error instanceof Error ? error.message : String(error)),
      "A required bundled artifact is missing from the deployment.",
    );
  }
  if (!response.ok) {
    throw new ArtifactError(
      "Bundled artifact " + path + " responded with status " + response.status + ".",
      "A required bundled artifact is missing from the deployment.",
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

export class ArtifactRegistry {
  readonly catalog: ArtifactCatalog;
  private readonly loader: PayloadLoader;

  constructor(catalog: ArtifactCatalog = ARTIFACT_CATALOG, loader: PayloadLoader = (path) => fetchPayload(path)) {
    this.catalog = catalog;
    this.loader = loader;
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
    const scoped = request.release
      ? releases.filter((entry) => entry.release === request.release)
      : releases;
    if (scoped.length === 0) {
      throw new ArtifactError("Release " + String(request.release) + " is not registered for " + request.providerId + ".");
    }

    // Newest release first, so a provider can pick a flavour by artifact id while the
    // tooling artifacts stay in the shared release.
    for (const release of [...scoped].reverse()) {
      const artifact = release.artifacts.find(
        (entry) =>
          (!request.artifactId || entry.id === request.artifactId) &&
          (!request.architecture || !entry.architecture || entry.architecture === request.architecture),
      );
      if (artifact) return { artifact, release };
    }

    throw new ArtifactError(
      "No artifact matched " + JSON.stringify(request) + " for " + request.providerId + ".",
    );
  }

  async loadPayload(artifact: PatchArtifact): Promise<Uint8Array> {
    if (artifact.source === "builtin:mock") {
      return new TextEncoder().encode(MOCK_ARTIFACT_PAYLOAD);
    }
    if (artifact.source?.startsWith("bundled:")) {
      return this.loader(artifact.source.slice("bundled:".length), artifact);
    }
    throw new ArtifactError(
      "Artifact source " + String(artifact.source) + " cannot be fetched: remote artifact downloads are not implemented in this build.",
      "Downloading upstream artifacts is not available in this build.",
    );
  }

  /**
   * Loads an artifact and refuses to return bytes whose digest does not match the
   * registry. Providers must use this instead of loadPayload so a tampered or
   * mismatched binary can never be executed.
   */
  async loadVerifiedPayload(artifact: PatchArtifact): Promise<Uint8Array> {
    const bytes = await this.loadPayload(artifact);
    const actualSha256 = await sha256Hex(bytes);
    if (artifact.sha256 !== undefined && actualSha256 !== artifact.sha256) {
      throw new ArtifactError(
        "Artifact " +
          artifact.id +
          " expected SHA-256 " +
          artifact.sha256 +
          " but hashed to " +
          actualSha256 +
          " (" +
          bytes.length +
          " bytes).",
        "The selected artifact failed its integrity check.",
      );
    }
    return bytes;
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

export function createArtifactRegistry(catalog?: ArtifactCatalog, loader?: PayloadLoader): ArtifactRegistry {
  return loader ? new ArtifactRegistry(catalog, loader) : new ArtifactRegistry(catalog);
}
