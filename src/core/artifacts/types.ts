export interface PatchArtifact {
  id: string;
  version: string;
  type: string;
  architecture?: string;
  sha256?: string;
  source?: string;
  sizeBytes?: number;
}

export interface ArtifactRelease {
  providerId: string;
  release: string;
  releasedAt?: string;
  notes?: string;
  artifacts: PatchArtifact[];
}

export interface ArtifactCatalog {
  schemaVersion: number;
  updatedAt: string;
  releases: ArtifactRelease[];
}
