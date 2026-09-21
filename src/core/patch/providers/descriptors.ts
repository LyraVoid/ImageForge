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
    "Uncompressed, gzip and LZ4 (frame or legacy, independent or dependent blocks) kernels are supported and re-compressed in the original container; XZ, LZMA, BZip2 and Zstandard kernels are refused.",
    "The superkey is optional and unset by default, matching the manager default where authentication is signature based.",
    "Two KernelPatch core images are registered: the official upstream build (only the me.bmax.apatch manager is trusted) and the Aster fork build (only the me.yuki.aster manager is trusted).",
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
  supportedFormats: ["boot", "init_boot"],
  supportedHeaderVersions: [0, 1, 2, 3, 4],
  supportedArchitectures: ["arm64"],
  requiresKernel: false,
  requiresRamdisk: true,
};

export const PLANNED_PROVIDER_DESCRIPTORS: PatchProviderDescriptor[] = [
  {
    id: "magisk",
    name: "Magisk",
    description: "Systemless root patching performed on the ramdisk.",
    status: "planned",
    website: "https://github.com/topjohnwu/Magisk",
    notes: [
      "Not implemented in this build.",
      "Targets boot.img, init_boot.img (GKI 13+), recovery.img, or vendor_boot.img depending on where the ramdisk lives.",
      "Requires CPIO read/write and the full compression matrix before it can be implemented.",
    ],
    supportedFormats: ["boot", "init_boot"],
    supportedHeaderVersions: [0, 1, 2, 3, 4],
    supportedArchitectures: ["arm64", "arm", "x86_64"],
    requiresKernel: false,
    requiresRamdisk: true,
  },
];
