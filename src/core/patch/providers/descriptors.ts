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
  {
    id: "kernelsu",
    name: "KernelSU",
    description: "Kernel based root with a loadable kernel module and patcher components.",
    status: "planned",
    website: "https://github.com/tiann/KernelSU",
    notes: [
      "Not implemented in this build.",
      "LKM mode modifies the ramdisk, so on Android 13+ it targets init_boot instead of boot; GKI mode always replaces the kernel in boot.",
      "KernelSU ships distinct artifacts (LKM plus patcher or injection components) that must be modelled individually.",
    ],
    supportedFormats: ["boot", "init_boot"],
    supportedHeaderVersions: [0, 1, 2, 3, 4],
    supportedArchitectures: ["arm64"],
    requiresKernel: false,
    requiresRamdisk: true,
  },
];
