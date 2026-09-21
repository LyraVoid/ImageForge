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

/** The KernelSU release the wrapper and the loadable modules are taken from. */
export const KERNELSU_RELEASE = "v3.3.0";

/**
 * The loadable module for a KMI. GKI keeps the module ABI stable within one, which is why
 * KernelSU publishes one build per KMI instead of one per kernel version.
 */
export function kernelsuLkmId(kmi: string): string {
  return "kernelsu-lkm-" + kmi;
}

/** The file name the release publishes for a KMI, kept verbatim so it stays traceable. */
export function kernelsuLkmSourceName(kmi: string): string {
  return "lkm-aarch64-" + kmi + "_kernelsu.ko";
}

/**
 * The loadable modules bundled with this build. They are built from KernelSU's kernel directory,
 * which is GPL-2.0-only, and are redistributed unmodified as separate programs with their own
 * licence; see THIRD_PARTY_LICENSES/kernelsu/.
 */
const KERNELSU_LKM: Array<{ kmi: string; sha256: string; sizeBytes: number }> = [
  { kmi: "android12-5.10", sha256: "5ca70d239f955139db23cd3028e578975cd038a7f2dc5f54ab4498a13f7ce03a", sizeBytes: 349936 },
  { kmi: "android13-5.10", sha256: "2bf61d77d1aac8c2cf01be5d6943bcb2b3f6a31ba127f4e2ce914c713ad24e80", sizeBytes: 345952 },
  { kmi: "android13-5.15", sha256: "251411414ea3b05b045c0aa93c75fe77713d11f732b97c8f375987307a90f003", sizeBytes: 160949 },
  { kmi: "android14-5.15", sha256: "9839ade0184687d20e05b1c7fd1c56043358eb468a0bff1fb11971bb78efbccb", sizeBytes: 470008 },
  { kmi: "android14-6.1", sha256: "db47d831e5a61bc4ca1563915ac1c61cd40ceda7dc6c3d19a9572dfdce72d14c", sizeBytes: 386600 },
  { kmi: "android15-6.6", sha256: "c31d994aaf285e7bf4cf1ec38c2bbf2d7f303d1a4a7d616405bcd9f850d684e5", sizeBytes: 315176 },
  { kmi: "android16-6.12", sha256: "877286f81d500c4ec546c96e9718c186b7379573c97ba5d5a35dd9a91465d076", sizeBytes: 386624 },
  { kmi: "android17-6.18", sha256: "adc743246822b3ea96c218425d4208aed2436805a73d2f3e8ed78cfa8602cadf", sizeBytes: 357304 },
];

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
        "Official KernelSU release. It ships two separately licensed components, and both are bundled here unmodified: the userspace init wrapper (ksuinit, GPL-3.0-or-later) and one loadable module per KMI (built from KernelSU's kernel directory, GPL-2.0-only). Each keeps its own licence; see THIRD_PARTY_LICENSES/kernelsu/ for the record and the corresponding source. Modules are published per KMI because GKI keeps the module ABI stable within one, so a module built for one kernel version loads on another version of the same KMI.",
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
        // One module per KMI, redistributed unmodified under its own licence.
        ...KERNELSU_LKM.map((module) => ({
          id: kernelsuLkmId(module.kmi),
          version: KERNELSU_RELEASE + " (" + module.kmi + ")",
          type: "loadable-module",
          architecture: "arm64",
          sha256: module.sha256,
          source: "bundled:/artifacts/kernelsu/" + kernelsuLkmSourceName(module.kmi),
          sizeBytes: module.sizeBytes,
        })),
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
