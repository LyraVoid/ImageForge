import type { ArtifactCatalog, ArtifactRelease } from "./types";

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

/** KernelPatch core image built from the extended branch the FolkPatch manager ships. */
export const APATCH_KPIMG_FOLK_ID = "apatch-kpimg-folk";

/** Upstream kptools compiled to WebAssembly; see third_party/kptools-wasm/. */
export const APATCH_KPTOOLS_ID = "apatch-kptools-wasm";

export const APATCH_KPIMG_SHA256 = "8f472d389d00f11c2d34c7059e1df8d580b9cb7d8c9f99b70877801b52992e2a";

export const APATCH_KPIMG_ASTER_SHA256 = "429718afcabe5bbcf51389ce41a2c983940b3392fb3fa20b99454f3465849a94";

export const APATCH_KPIMG_FOLK_SHA256 = "d22352eee8bc1452436b1c3ee9ba7ebfb4408a1ba93456f02333a23c56df1509";

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

/** One loadable module of the KernelSU family: the bytes its manager writes as `kernelsu.ko`. */
interface KernelsuModule {
  kmi: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * One manager of the KernelSU family. They share the injection algorithm — `init` becomes
 * `init.real`, a wrapper takes its place and a module is added next to it — and differ in the
 * wrapper, the modules and the app that trusts them, so each is registered as its own release and
 * selected as a flavour rather than being a provider of its own.
 */
interface KernelsuFamilyMember {
  /** Flavour id, artifact id prefix and the directory the payloads live in. */
  flavor: string;
  release: string;
  releasedAt: string;
  /** The manager package the wrapper and the modules trust. */
  managerPackage: string;
  /** The wrapper. `source` is omitted when the manager publishes the same bytes as upstream's. */
  ksuinit: { sha256: string; sizeBytes: number; source?: string };
  modules: KernelsuModule[];
  notes: string;
}

/**
 * The loadable modules and wrappers bundled with this build. They are built from each project's
 * kernel directory, which is GPL-2.0-only, and are redistributed unmodified as separate programs
 * with their own licence; see THIRD_PARTY_LICENSES/kernelsu/.
 */
const KERNELSU_FAMILY: KernelsuFamilyMember[] = [
  {
    flavor: "kernelsu",
    release: KERNELSU_RELEASE,
    releasedAt: "2026-08-28T00:00:00.000Z",
    managerPackage: "me.weishu.kernelsu",
    ksuinit: { sha256: KERNELSU_KSUINIT_SHA256, sizeBytes: 607360 },
    modules: [
      { kmi: "android12-5.10", sha256: "5ca70d239f955139db23cd3028e578975cd038a7f2dc5f54ab4498a13f7ce03a", sizeBytes: 349936 },
      { kmi: "android13-5.10", sha256: "2bf61d77d1aac8c2cf01be5d6943bcb2b3f6a31ba127f4e2ce914c713ad24e80", sizeBytes: 345952 },
      { kmi: "android13-5.15", sha256: "c3ddba3333b6b39ed16f37ef6c713624662916a75f2018ef1261f24650505dd4", sizeBytes: 374032 },
      { kmi: "android14-5.15", sha256: "9839ade0184687d20e05b1c7fd1c56043358eb468a0bff1fb11971bb78efbccb", sizeBytes: 470008 },
      { kmi: "android14-6.1", sha256: "db47d831e5a61bc4ca1563915ac1c61cd40ceda7dc6c3d19a9572dfdce72d14c", sizeBytes: 386600 },
      { kmi: "android15-6.6", sha256: "c31d994aaf285e7bf4cf1ec38c2bbf2d7f303d1a4a7d616405bcd9f850d684e5", sizeBytes: 315176 },
      { kmi: "android16-6.12", sha256: "877286f81d500c4ec546c96e9718c186b7379573c97ba5d5a35dd9a91465d076", sizeBytes: 386624 },
      { kmi: "android17-6.18", sha256: "adc743246822b3ea96c218425d4208aed2436805a73d2f3e8ed78cfa8602cadf", sizeBytes: 357304 },
    ],
    notes:
      "Official KernelSU release. It ships two separately licensed components, and both are bundled here unmodified: the userspace init wrapper (ksuinit, GPL-3.0-or-later) and one loadable module per KMI (built from KernelSU's kernel directory, GPL-2.0-only). Each keeps its own licence; see THIRD_PARTY_LICENSES/kernelsu/ for the record and the corresponding source. Modules are published per KMI because GKI keeps the module ABI stable within one, so a module built for one kernel version loads on another version of the same KMI.",
  },
  {
    flavor: "sukisu",
    release: "v4.2.0",
    releasedAt: "2026-09-01T00:00:00.000Z",
    managerPackage: "com.sukisu.ultra",
    // SukiSU publishes its own wrapper, and it is byte for byte upstream's, so the upstream file is
    // reused instead of being bundled twice.
    ksuinit: { sha256: KERNELSU_KSUINIT_SHA256, sizeBytes: 607360, source: "bundled:/artifacts/kernelsu/kernelsu/ksuinit" },
    modules: [
      { kmi: "android12-5.10", sha256: "bc7138b278ce06359334de06cfc398cea66bd3a5392c0a21b9b3016784108e24", sizeBytes: 364664 },
      { kmi: "android13-5.10", sha256: "03cbd36551ece175032795a35479bac6a80a7ed242b2b4d0dcdf2f27add3b6d4", sizeBytes: 356864 },
      { kmi: "android13-5.15", sha256: "31720f6d41c6e9b11e0b1142f05870e046094bfbdd4d7a684d650fb2e3628548", sizeBytes: 385528 },
      { kmi: "android14-5.15", sha256: "ab6f5c9c660a693187560131ecec7fc7ba2f5a161628c4fde102a866fd13e98a", sizeBytes: 501200 },
      { kmi: "android14-6.1", sha256: "e755405a4960fd11c4a60d59c68c40dfde0d8975b6cca010f7db8a0f01c6cd9d", sizeBytes: 412952 },
      { kmi: "android15-6.6", sha256: "fc57ff64d6e5a0c7dc05bc7f2d0f7b42bc830a4e3f7efd58fa306f05e86bb9c5", sizeBytes: 327520 },
      { kmi: "android16-6.12", sha256: "0410c3b9112e9930f6434cdc4a6c354af1636e6fa0a948b063fd42706609046f", sizeBytes: 390480 },
      { kmi: "android17-6.18", sha256: "9f28e43bc024169806893760eb0ff698e84d5503623ce90334f3732795c2f79d", sizeBytes: 365392 },
    ],
    notes:
      "Official SukiSU-Ultra release. Its wrapper is byte for byte upstream KernelSU's, and its modules are its own builds, compiled against the SukiSU manager certificate, so they are registered here rather than with upstream. The patcher is upstream's plus the spoof_release and spoof_version keys it accepts in ksu_config. Wrapper GPL-3.0-or-later, modules GPL-2.0-only; see THIRD_PARTY_LICENSES/kernelsu/.",
  },
  {
    flavor: "resukisu",
    release: "v4.2.0-rc3",
    releasedAt: "2026-09-22T00:00:00.000Z",
    managerPackage: "com.resukisu.resukisu",
    ksuinit: { sha256: "761afc0cac6ad839685493246cb352fa70a51ac2898daad70d1e88bf394b6dde", sizeBytes: 611424 },
    modules: [
      { kmi: "android12-5.10", sha256: "6649518c24544a3df80aaef3afd7ef3ded5858d538986c9b9f27bfd800ea716c", sizeBytes: 397792 },
      { kmi: "android13-5.10", sha256: "9113a4e901802f2f573b7677e776bd2d7720090cdee21f22bb4744e51e865b85", sizeBytes: 391120 },
      { kmi: "android13-5.15", sha256: "3f79b9b7636587467facb3cfb4594e36ea5973e1cda1508454d66580ea1c8a76", sizeBytes: 424568 },
      { kmi: "android14-5.15", sha256: "1eca0e8449dcb01504b2208ff23f5844519693712b756a94c8b4a6d38bf10e13", sizeBytes: 548864 },
      { kmi: "android14-6.1", sha256: "acd22787917ca1fe956578b6e1e7fcb0c478241812be6d1f9d566bb3c1a33549", sizeBytes: 453872 },
      { kmi: "android15-6.6", sha256: "4241d4334d22b5824023c848086f803973b8af44f28032572bd1146cd938501d", sizeBytes: 361232 },
      { kmi: "android16-6.12", sha256: "776e9b9def9fa163692d79c08b2b5d017652968902cd15995b2577c4ecdfed08", sizeBytes: 428984 },
      { kmi: "android17-6.18", sha256: "5cc3798b8cb3d0de8dbaf4f2e4e61b9c8e5c34c4059fc12745fb1c5ed518202f", sizeBytes: 401448 },
    ],
    notes:
      "Official ReSukiSU release. The project publishes only APKs, so the wrapper and the modules were recovered from the raw DEFLATE streams its libksud.so embeds them in (scripts/scan-embedded-elf.py), and each module's KMI was identified by its vermagic; see THIRD_PARTY_LICENSES/kernelsu/. Its patcher is upstream's plus bundled=1 in ksu_config when the bundled module is written, and the optional ksu_block_modules file, which this build does not offer. Wrapper GPL-3.0-or-later, modules GPL-2.0-only.",
  },
  {
    flavor: "yukisu",
    release: "v1.7.0",
    releasedAt: "2026-09-18T00:00:00.000Z",
    managerPackage: "com.anatdx.yukisu",
    ksuinit: { sha256: "7df0b720ee7db30f1efe58d536c9675b1bd530d8f38904260ed580353995cc1e", sizeBytes: 309904 },
    modules: [
      { kmi: "android12-5.10", sha256: "9e52ef92606b7356102f43f9ef77376ab2f07d6fd0016be7708df1175227e806", sizeBytes: 1252296 },
      { kmi: "android13-5.10", sha256: "81cb2e5bdee6232027f58063c911c821b12c4f8d19dceccf12cdde02e3447b05", sizeBytes: 1179696 },
      { kmi: "android13-5.15", sha256: "21540a501f1b435d3fcfe56cbe3fe69d721047657a6f1953de65c3fe01f681f7", sizeBytes: 1254296 },
      { kmi: "android14-5.15", sha256: "43b818f63a807fa59d292f9ad42c9ce5a088c36140efe6738849478e06710e67", sizeBytes: 1558376 },
      { kmi: "android14-6.1", sha256: "53cb3028eaa81c39d5e6792a6a72ad60845d0a2efd573c455043af53dd298230", sizeBytes: 1239512 },
      { kmi: "android15-6.6", sha256: "30a3ecf8091affc282f723a90a6043a893dca3ea9c0456cb668e29678410333e", sizeBytes: 1001808 },
      { kmi: "android16-6.12", sha256: "f89f5a0363cbcd62f49838f7db2a5e56a0bb95ff41257684c41629e49f8ea776", sizeBytes: 1132112 },
      { kmi: "android17-6.18", sha256: "9763badcfd623810a37cfbf53e0e0b50c48d1c98e5a0974b08b8311325c977b4", sizeBytes: 1074696 },
    ],
    notes:
      "Official YukiSU release. Its patcher is upstream's plus bundled=1 and the ksu_allow_shell entry it removes instead of allow_shell, and it also writes its launch settings into the module itself (a 512 byte imgpatch config and a SuperKey block), which this build reproduces. Its wrapper is embedded in its libksud.so and was recovered from there; the modules are release assets. Wrapper GPL-3.0-or-later, modules GPL-2.0-only; see THIRD_PARTY_LICENSES/kernelsu/.",
  },
  {
    flavor: "kowsu",
    release: "manager-build-32737",
    releasedAt: "2026-09-23T00:00:00.000Z",
    managerPackage: "com.kowx712.supermanager",
    ksuinit: { sha256: "7120b1702d01ab9e1bc6036a9de445c4ce9c44092c6fd30c76bec8de393273a8", sizeBytes: 607552 },
    modules: [
      { kmi: "android12-5.10", sha256: "2913307e65101a95166a434b10cf76cf77943b25ac1af48521d9e7f1aee31aa0", sizeBytes: 391176 },
      { kmi: "android13-5.10", sha256: "9b135fc62560b2ca9430d1ddd5d20c9fb9865f1af47f145986d3d1518fb87cf4", sizeBytes: 381800 },
      { kmi: "android13-5.15", sha256: "ba8e1d3492d55cb7e208e94a81cccf46ef195f2b9a6731d4f9d28948873aa790", sizeBytes: 405536 },
      { kmi: "android14-5.15", sha256: "e86adb3198b186fda4558c0e8262be4f1dd49b205c3150ff38ac494c4b35fa21", sizeBytes: 531824 },
      { kmi: "android14-6.1", sha256: "94ca998b5a71ed17a24f8097cef0c802e48c57316dedae7d7fd8f0fc574cbef4", sizeBytes: 441784 },
      { kmi: "android15-6.6", sha256: "fdd9a5bd765fb1ebf6afec4246a83e982d4d3ecdb1e384349c1eb61a48370295", sizeBytes: 339304 },
      { kmi: "android16-6.12", sha256: "14a5a860d70abef52a99a5f6e96a838cfb89bd55f3ccb58e680aab0e795047d1", sizeBytes: 418160 },
      { kmi: "android17-6.18", sha256: "31d5fb79da54e3f2f1bbafa8c93c1ef92771f489c950e58ada5a8e7e07783271", sizeBytes: 388352 },
    ],
    notes:
      "Official KowSU Manager release (zaominn/KowSU, built from KOWX712/KernelSU). The project publishes only APKs, so the wrapper and the modules were recovered from the raw DEFLATE streams its libksud.so embeds them in, with each module's KMI identified by its vermagic. Its patcher is upstream's plus bundled=1. The release also ships a second build of every module whose internal name is ksu (the xx variant); this build does not bundle those, because a user supplied module covers that case. Wrapper GPL-3.0-or-later, modules GPL-2.0-only; see THIRD_PARTY_LICENSES/kernelsu/.",
  },
];

/** The artifact id of one manager's init wrapper. */
export function kernelsuFamilyKsuinitId(flavor: string): string {
  return flavor + "-ksuinit";
}

/** The artifact id of one manager's loadable module for a KMI. */
export function kernelsuFamilyLkmId(flavor: string, kmi: string): string {
  return flavor + "-lkm-" + kmi;
}

/** Where a payload of one manager lives in the bundle. */
export function kernelsuFamilySource(flavor: string, file: string): string {
  return "bundled:/artifacts/kernelsu/" + flavor + "/" + file;
}

/** The wrappers and modules of one manager, as a release of the `kernelsu` provider. */
function kernelsuFamilyRelease(member: KernelsuFamilyMember): ArtifactRelease {
  const files = member.modules.map((module) => ({
    id: kernelsuFamilyLkmId(member.flavor, module.kmi),
    version: member.release + " (" + module.kmi + ")",
    type: "loadable-module",
    architecture: "arm64",
    sha256: module.sha256,
    source: kernelsuFamilySource(member.flavor, kernelsuLkmSourceName(module.kmi)),
    sizeBytes: module.sizeBytes,
  }));
  return {
    providerId: "kernelsu",
    release: member.release,
    releasedAt: member.releasedAt,
    notes: member.notes,
    artifacts: [
      {
        id: kernelsuFamilyKsuinitId(member.flavor),
        version: member.release,
        type: "init-wrapper",
        architecture: "arm64",
        sha256: member.ksuinit.sha256,
        source: member.ksuinit.source ?? kernelsuFamilySource(member.flavor, "ksuinit"),
        sizeBytes: member.ksuinit.sizeBytes,
      },
      ...files,
    ],
  };
}

/** Magisk release the ramdisk payloads are taken from. */
export const MAGISK_RELEASE = "v30.7";

/** WeaveMask release the ramdisk payloads of that flavour are taken from. */
export const WEAVEMASK_RELEASE = "v30.7.5";

/** MagisKube release the ramdisk payloads of that flavour are taken from. */
export const MAGISKUBE_RELEASE = "1.0.0";

export const MAGISK_MAGISKINIT_ID = "magisk-magiskinit";
export const MAGISK_MAGISK_PAYLOAD_ID = "magisk-magisk";
export const MAGISK_STUB_PAYLOAD_ID = "magisk-stub";
export const MAGISK_INIT_LD_PAYLOAD_ID = "magisk-init-ld";

export const WEAVEMASK_MAGISKINIT_ID = "weavemask-magiskinit";
export const WEAVEMASK_MAGISK_PAYLOAD_ID = "weavemask-magisk";
export const WEAVEMASK_STUB_PAYLOAD_ID = "weavemask-stub";
export const WEAVEMASK_INIT_LD_PAYLOAD_ID = "weavemask-init-ld";

export const MAGISKUBE_MAGISKINIT_ID = "magiskube-magiskinit";
export const MAGISKUBE_MAGISK_PAYLOAD_ID = "magiskube-magisk";
export const MAGISKUBE_STUB_PAYLOAD_ID = "magiskube-stub";
export const MAGISKUBE_INIT_LD_PAYLOAD_ID = "magiskube-init-ld";

export const ARTIFACT_CATALOG: ArtifactCatalog = {
  schemaVersion: 1,
  updatedAt: "2026-09-22T00:00:00.000Z",
  releases: [
    {
      providerId: "magisk",
      release: MAGISK_RELEASE,
      releasedAt: "2026-02-23T00:00:00.000Z",
      notes:
        "Official Magisk release. The patcher injects magiskinit as init and compresses three payloads into overlay.d/sbin, then stores its configuration in .backup/.magisk. The payloads are bundled uncompressed, exactly the files Magisk's own patcher feeds to magiskboot, and are compressed at patch time with the same codec, settings and declared dictionary (preset 6, CRC32, 64 MiB), so the produced streams are byte for byte the ones its patcher writes. Magisk is GPL-3.0 throughout, so there is no per-directory licence split to observe.",
      artifacts: [
        {
          id: MAGISK_MAGISKINIT_ID,
          version: MAGISK_RELEASE,
          type: "init",
          architecture: "arm64",
          sha256: "383670a7ba3a6a4b79e5f3467e1da4b66a5df66a9b356ab9f70916854dd6b468",
          source: "bundled:/artifacts/magisk/magiskinit",
          sizeBytes: 199960,
        },
        {
          id: MAGISK_MAGISK_PAYLOAD_ID,
          version: MAGISK_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "2d8419018dda41f7d9aca94c0ca8f926f3b8447ca5cf7fb71faeb8d05e29694e",
          source: "bundled:/artifacts/magisk/magisk",
          sizeBytes: 394232,
        },
        {
          id: MAGISK_STUB_PAYLOAD_ID,
          version: MAGISK_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "f0230e0864be255d963befa929ae1c0bb85c4df3e3578bb6cecc3049b6881eb0",
          source: "bundled:/artifacts/magisk/stub",
          sizeBytes: 70013,
        },
        {
          id: MAGISK_INIT_LD_PAYLOAD_ID,
          version: MAGISK_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "c71e69780bb7ce6d6c26b2d794a3c631689bed130519762716fee285a10417f0",
          source: "bundled:/artifacts/magisk/init-ld",
          sizeBytes: 5208,
        },
      ],
    },
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
      providerId: "magisk",
      release: WEAVEMASK_RELEASE,
      releasedAt: "2026-05-25T00:00:00.000Z",
      notes:
        "Official WeaveMask release, a fork of Magisk whose patcher is byte for byte Magisk v30.7's: the same files, modes, configuration keys and codec settings, with the manager package and the payloads being WeaveMask's own. Its build of magiskinit only trusts the WeaveMask app (io.github.seyud.weave), so the payloads have to come from this release and the produced image needs that app. Distributed as a separate unmodified program; WeaveMask is GPL-3.0 throughout, like Magisk.",
      artifacts: [
        {
          id: WEAVEMASK_MAGISKINIT_ID,
          version: WEAVEMASK_RELEASE,
          type: "init",
          architecture: "arm64",
          sha256: "b3df27f76fa68ee477efe36c6ecd6942ba3f7246e90c86540f2f22072103b948",
          source: "bundled:/artifacts/weavemask/magiskinit",
          sizeBytes: 199936,
        },
        {
          id: WEAVEMASK_MAGISK_PAYLOAD_ID,
          version: WEAVEMASK_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "4e62c1f7ba3f5af7b790e718c5b263a7da44cf9c8a749497d6652a216ecc2023",
          source: "bundled:/artifacts/weavemask/magisk",
          sizeBytes: 393504,
        },
        {
          id: WEAVEMASK_STUB_PAYLOAD_ID,
          version: WEAVEMASK_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "589013c08c2d26ff5cb6d8fc6cbcffa71cfcfdd7662d4ba358d155b61b8f147f",
          source: "bundled:/artifacts/weavemask/stub",
          sizeBytes: 33151,
        },
        {
          id: WEAVEMASK_INIT_LD_PAYLOAD_ID,
          version: WEAVEMASK_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "54ec98f3f93473e51252267a8997cd12878dd463263f3dc2a32c14ab7951f9f0",
          source: "bundled:/artifacts/weavemask/init-ld",
          sizeBytes: 5208,
        },
      ],
    },
    {
      providerId: "magisk",
      release: MAGISKUBE_RELEASE,
      releasedAt: "2026-08-01T00:00:00.000Z",
      notes:
        "Official MagisKube release (SunRayEx/Magisk-Metro, a fork of Magisk built on the same v30.7 base: its versionCode is 30700 and the four ramdisk patcher files are byte for byte Magisk v30.7's). Its binaries are built with the manager package org.magiskube.magisk compiled in, so the payloads have to come from this release and the produced image needs that app. Distributed as a separate unmodified program; the fork is GPL-3.0 throughout, like Magisk.",
      artifacts: [
        {
          id: MAGISKUBE_MAGISKINIT_ID,
          version: MAGISKUBE_RELEASE,
          type: "init",
          architecture: "arm64",
          sha256: "2f47ef9ff012bf7da2f38170fe1bc4eeea335bc273ec86a4daf31f06ded39ffe",
          source: "bundled:/artifacts/magiskube/magiskinit",
          sizeBytes: 199856,
        },
        {
          id: MAGISKUBE_MAGISK_PAYLOAD_ID,
          version: MAGISKUBE_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "6dd9eea6bcaa734edd1dd101cc88ce89adf6ebc73dc28231709a4354b1a3f680",
          source: "bundled:/artifacts/magiskube/magisk",
          sizeBytes: 393912,
        },
        {
          id: MAGISKUBE_STUB_PAYLOAD_ID,
          version: MAGISKUBE_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "77e727ebe42879fe9e98e9098b3af93caf6e8e35feaf59760db77ff0ecf57717",
          source: "bundled:/artifacts/magiskube/stub",
          sizeBytes: 90557,
        },
        {
          id: MAGISKUBE_INIT_LD_PAYLOAD_ID,
          version: MAGISKUBE_RELEASE,
          type: "payload",
          architecture: "arm64",
          sha256: "54ec98f3f93473e51252267a8997cd12878dd463263f3dc2a32c14ab7951f9f0",
          source: "bundled:/artifacts/magiskube/init-ld",
          sizeBytes: 5208,
        },
      ],
    },
    // One release per manager of the family: one wrapper and one module per KMI, each redistributed
    // unmodified under its own licence.
    ...KERNELSU_FAMILY.map(kernelsuFamilyRelease),
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
    {
      providerId: "apatch",
      release: "folk-1de1a37",
      releasedAt: "2026-08-31T00:00:00.000Z",
      notes:
        "Official KernelPatch release 0.13.8 (asset kpimg-android) from LyraVoid/KernelPatch, the extended branch FolkPatch is built on: revision 1de1a37304406615a3c3b6f1d28d2cd926b93a0f, which adds the FolkPatch path hiding, network isolation, su audit and uts hooks and trusts the FolkPatch manager (me.yuki.folk) only. Reports KernelPatch image version 0.13.8. Patching a stock boot image with it through our WebAssembly kptools build produces exactly the same kernel as the branch's own kptools-linux release binary, which tests/integration/folkpatch-reproduction.test.ts checks against each other.",
      artifacts: [
        {
          id: APATCH_KPIMG_FOLK_ID,
          version: "0.13.8",
          type: "kernelpatch-image",
          architecture: "arm64",
          sha256: APATCH_KPIMG_FOLK_SHA256,
          source: "bundled:/artifacts/apatch/kpimg-folk.bin",
          sizeBytes: 474640,
        },
      ],
    },
  ],
};
