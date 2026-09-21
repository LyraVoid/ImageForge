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

/** KernelPatch core image shipped inside the APatch release package. */
export const APATCH_KPIMG_ID = "apatch-kpimg";

/** Upstream kptools compiled to WebAssembly; see third_party/kptools-wasm/. */
export const APATCH_KPTOOLS_ID = "apatch-kptools-wasm";

export const APATCH_KPIMG_SHA256 = "8f472d389d00f11c2d34c7059e1df8d580b9cb7d8c9f99b70877801b52992e2a";

export const APATCH_KPTOOLS_SHA256 = "bb53abeae8be16f4d2127af1b700d95ff8a75b38eea2829251c9f774c9b61c4c";

export const ARTIFACT_CATALOG: ArtifactCatalog = {
  schemaVersion: 1,
  updatedAt: "2026-09-21T00:00:00.000Z",
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
    {
      providerId: "apatch",
      release: "11224",
      releasedAt: "2026-09-21T00:00:00.000Z",
      notes:
        "APatch release 11224 supplies the KernelPatch core image, which reports KernelPatch image version 0.13.3. The kptools build is pinned to KernelPatch 0.13.8 (revision 72a904c4); the two versions differ because the APatch package pins its own KernelPatch revision. The combination was verified against a real GKI android13-5.10 boot image.",
      artifacts: [
        {
          id: APATCH_KPIMG_ID,
          version: "0.13.3",
          type: "kernelpatch-image",
          architecture: "arm64",
          sha256: APATCH_KPIMG_SHA256,
          source: "bundled:/artifacts/apatch/kpimg",
          sizeBytes: 190816,
        },
        {
          id: APATCH_KPTOOLS_ID,
          version: "0.13.8",
          type: "kernel-image-tool",
          architecture: "wasm32",
          sha256: APATCH_KPTOOLS_SHA256,
          source: "bundled:/wasm/kptools.wasm",
          sizeBytes: 634242,
        },
      ],
    },
  ],
};
