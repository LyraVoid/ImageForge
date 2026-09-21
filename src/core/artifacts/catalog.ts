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

/** Upstream KernelPatch core image, taken from the official APatch release package. */
export const APATCH_KPIMG_ID = "apatch-kpimg";

/** KernelPatch core image built from the Aster fork of KernelPatch. */
export const APATCH_KPIMG_ASTER_ID = "apatch-kpimg-aster";

/** Upstream kptools compiled to WebAssembly; see third_party/kptools-wasm/. */
export const APATCH_KPTOOLS_ID = "apatch-kptools-wasm";

export const APATCH_KPIMG_SHA256 = "8f472d389d00f11c2d34c7059e1df8d580b9cb7d8c9f99b70877801b52992e2a";

export const APATCH_KPIMG_ASTER_SHA256 = "429718afcabe5bbcf51389ce41a2c983940b3392fb3fa20b99454f3465849a94";

export const APATCH_KPTOOLS_SHA256 = "bb53abeae8be16f4d2127af1b700d95ff8a75b38eea2829251c9f774c9b61c4c";

/** KernelSU userspace init wrapper; see THIRD_PARTY_LICENSES/kernelsu/. */
export const KERNELSU_KSUINIT_ID = "kernelsu-ksuinit";

export const KERNELSU_KSUINIT_SHA256 = "b49fff3252cdcd14bf80472becbd96c4f17028a632b364e8d455d335b94f1345";

/** The KernelSU release the wrapper is taken from. */
export const KERNELSU_RELEASE = "v3.3.0";

export const ARTIFACT_CATALOG: ArtifactCatalog = {
  schemaVersion: 1,
  updatedAt: "2026-09-22T00:00:00.000Z",
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
      providerId: "kernelsu",
      release: KERNELSU_RELEASE,
      releasedAt: "2026-08-28T00:00:00.000Z",
      notes:
        "Official KernelSU release. Only the userspace init wrapper (ksuinit, GPL-3.0-or-later) is bundled. The loadable module (lkm-aarch64-{kmi}_kernelsu.ko) is built from the kernel directory and is GPL-2.0-only, which cannot be combined with this project's AGPL-3.0-or-later licence, so it is supplied by the user and verified before use. Loadable modules are published per KMI because GKI keeps the module ABI stable within one.",
      artifacts: [
        {
          id: KERNELSU_KSUINIT_ID,
          version: KERNELSU_RELEASE,
          type: "init-wrapper",
          architecture: "arm64",
          sha256: KERNELSU_KSUINIT_SHA256,
          source: "bundled:/artifacts/kernelsu/ksuinit",
          sizeBytes: 607360,
        },
      ],
    },
    {
      providerId: "apatch",
      release: "11224",
      releasedAt: "2026-09-21T00:00:00.000Z",
      notes:
        "Official APatch release 11224 supplies the upstream KernelPatch core image, which reports KernelPatch image version 0.13.3 and only trusts the official manager (me.bmax.apatch). The kptools build is pinned to KernelPatch 0.13.8 (revision 72a904c4).",
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
    {
      providerId: "apatch",
      release: "aster-0ff4ae2",
      releasedAt: "2026-09-15T00:00:00.000Z",
      notes:
        "Official KernelPatch-Aster release 0.13.8 (asset kpimg-android), the release built from revision 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981: upstream KernelPatch 0.13.8 plus one commit that trusts the Aster manager (me.yuki.aster) only and accepts its v2+v3 signature. Reports KernelPatch image version 0.13.8. Patching a stock boot image with it reproduces the boot partition of a device flashed from the same revision byte for byte, and our WebAssembly kptools build produces exactly the same kernel as the official kptools-linux release binary.",
      artifacts: [
        {
          id: APATCH_KPIMG_ASTER_ID,
          version: "0.13.8",
          type: "kernelpatch-image",
          architecture: "arm64",
          sha256: APATCH_KPIMG_ASTER_SHA256,
          source: "bundled:/artifacts/apatch/kpimg-aster.bin",
          sizeBytes: 340880,
        },
      ],
    },
  ],
};
