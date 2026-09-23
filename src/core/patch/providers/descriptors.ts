import type { PatchProviderDescriptor } from "../types";

export const MOCK_PROVIDER_DESCRIPTOR: PatchProviderDescriptor = {
  id: "mock",
  name: "Mock Provider",
  description:
    "Structural placeholder that exercises the whole pipeline: it rewrites the kernel cmdline and writes a bootconfig manifest. It does not grant root.",
  status: "available",
  notes: [
    "Never describes itself as a root solution.",
    "Used to validate analysis, planning, worker execution, verification and download.",
  ],
  supportedFormats: ["boot", "init_boot"],
  supportedHeaderVersions: [0, 1, 2, 3, 4],
  supportedArchitectures: ["arm64", "arm", "x86_64", "unknown"],
  requiresKernel: false,
  requiresRamdisk: true,
};

export const APATCH_PROVIDER_DESCRIPTOR: PatchProviderDescriptor = {
  id: "apatch",
  name: "APatch",
  description:
    "KernelPatch based root: the KernelPatch core image (kpimg) is injected into the kernel inside boot.img.",
  status: "available",
  website: "https://github.com/bmax121/APatch",
  notes: [
    "Patches the kernel only, therefore boot.img is the only valid target: init_boot.img carries no kernel.",
    "Requires CONFIG_KALLSYMS=y in the target kernel. This is verified before the patch runs.",
    "Uncompressed, gzip, LZ4 (frame or legacy, independent or dependent blocks) and xz kernels are supported and re-compressed in the original container; LZMA, BZip2 and Zstandard kernels are refused.",
    "The superkey is optional and unset by default, matching the manager default where authentication is signature based.",
    "Three KernelPatch core images are registered, because each build only trusts the manager it was made for: the official upstream build (me.bmax.apatch), the Aster fork build (me.yuki.aster) and the extended branch FolkPatch ships (me.yuki.folk).",
    "A custom flavour takes the core image from the run instead of the registry: the file has to start with the KernelPatch magic, and its digest and version are reported in the result.",
    "KernelPatch modules (KPM) can be attached, and are embedded by kptools with the same command shape FolkTool uses.",
    "Runs the upstream KernelPatch kptools, compiled to WebAssembly, inside the patch worker.",
  ],
  supportedFormats: ["boot"],
  supportedHeaderVersions: [0, 1, 2, 3, 4],
  supportedArchitectures: ["arm64"],
  requiresKernel: true,
  requiresRamdisk: false,
};

export const PROVIDER_DESCRIPTORS: PatchProviderDescriptor[] = [
  MOCK_PROVIDER_DESCRIPTOR,
  APATCH_PROVIDER_DESCRIPTOR,
];

export const KERNELSU_PROVIDER_DESCRIPTOR: PatchProviderDescriptor = {
  id: "kernelsu",
  name: "KernelSU",
  description:
    "Kernel based root: the KernelSU loadable module is injected into the ramdisk, which replaces init.",
  status: "available",
  website: "https://github.com/tiann/KernelSU",
  notes: [
    "Injects the module into the ramdisk of init_boot.img (GKI 13+) or of a boot.img that carries one, exactly as ksud does: init becomes init.real, a new init (ksuinit) is added, and kernelsu.ko is added next to it.",
    "The build ships one loadable module per KMI (GPL-2.0-only, redistributed unmodified as a separate program with its own licence; see THIRD_PARTY_LICENSES/kernelsu/). A module supplied by the user overrides the bundled one, and either way its .modinfo and the kernel version it was built for are checked before anything is written.",
    "The KMI is read from the kernel banner when the image carries a kernel, and can be selected otherwise; init_boot.img carries no kernel, so there it has to be selected.",
    "Refuses a ramdisk that is already patched by Magisk, and reports when KernelSU is already installed.",
    "The KernelSU manager app (me.weishu.kernelsu) has to be installed on the device.",
  ],
  supportedFormats: ["boot", "init_boot", "vendor_boot"],
  supportedHeaderVersions: [0, 1, 2, 3, 4],
  supportedArchitectures: ["arm64"],
  requiresKernel: false,
  requiresRamdisk: true,
};

export const MAGISK_PROVIDER_DESCRIPTOR: PatchProviderDescriptor = {
  id: "magisk",
  name: "Magisk",
  description:
    "Systemless root: magiskinit replaces the ramdisk init, and Magisk's payloads are written under overlay.d/sbin.",
  status: "available",
  website: "https://github.com/topjohnwu/Magisk",
  notes: [
    "Rewrites the ramdisk the way Magisk's own patcher does: init becomes magiskinit (0750), overlay.d/ and overlay.d/sbin are created (0750), magisk.xz, stub.xz and init-ld.xz are added (0644), and .backup/.magisk holds the configuration (000).",
    "The stock init is replaced rather than renamed.",
    "fstab entries are patched exactly like magiskboot does when verity or forced encryption are not kept: the matching flag strings are removed and verity_key is dropped.",
    "SHA1 in the configuration is the digest of the whole source image, like Magisk's app records it.",
    "Refuses a ramdisk that Magisk or KernelSU already patched.",
    "Like Magisk's own patcher, the stock init is kept inside the ramdisk as .backup/init.xz, together with .backup/.rmlist, so Magisk's app can restore the image by itself.",
    "The payloads are bundled from the pinned Magisk release, which is GPL-3.0.",
    "The Magisk app (com.topjohnwu.magisk) has to be installed for the produced image to be usable.",
  ],
  supportedFormats: ["boot", "init_boot", "vendor_boot"],
  supportedHeaderVersions: [0, 1, 2, 3, 4],
  supportedArchitectures: ["arm64"],
  requiresKernel: false,
  requiresRamdisk: true,
};

export const PLANNED_PROVIDER_DESCRIPTORS: PatchProviderDescriptor[] = [
];
