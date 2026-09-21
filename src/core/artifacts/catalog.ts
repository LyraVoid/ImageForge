import type { ArtifactCatalog } from "./types";

export const MOCK_ARTIFACT_ID = "imageforge-mock-artifact";

export const MOCK_ARTIFACT_PAYLOAD = [
  MOCK_ARTIFACT_ID,
  "version=1.0.0",
  "architecture=arm64",
  "note=deterministic placeholder artifact for the Mock Provider",
].join("\n") + "\n";

export const MOCK_ARTIFACT_SHA256 = "7689546eeb6ac4c976a1c53cac240e4d52a70b9a51c3b7e0ac65ff11ef4d486c";

export const MOCK_ARTIFACT_SIZE_BYTES = 120;

export const ARTIFACT_CATALOG: ArtifactCatalog = {
  schemaVersion: 1,
  updatedAt: "2024-01-01T00:00:00.000Z",
  releases: [
    {
      providerId: "mock",
      release: "1.0.0",
      releasedAt: "2024-01-01T00:00:00.000Z",
      notes:
        "Placeholder release used to exercise the resolver, the hash check and the patch pipeline. It does not patch a real Android boot image and is not a root solution.",
      artifacts: [
        {
          id: MOCK_ARTIFACT_ID,
          version: "1.0.0",
          type: "mock",
          architecture: "arm64",
          sha256: MOCK_ARTIFACT_SHA256,
          source: "builtin:mock",
          sizeBytes: MOCK_ARTIFACT_SIZE_BYTES,
        },
      ],
    },
  ],
};
