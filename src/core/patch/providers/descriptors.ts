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
      "The upstream patch pipeline, artifact layout, build system and license must be read from the current upstream revision before any implementation.",
    ],
    supportedFormats: ["boot", "init_boot"],
    supportedHeaderVersions: [0, 1, 2, 3, 4],
    supportedArchitectures: ["arm64", "arm", "x86_64"],
  },
  {
    id: "kernelsu",
    name: "KernelSU",
    description: "Kernel based root with a loadable kernel module and patcher components.",
    status: "planned",
    website: "https://github.com/tiann/KernelSU",
    notes: [
      "Not implemented in this build.",
      "KernelSU ships distinct artifacts (LKM plus patcher or injection components) that must be modelled individually in the artifact registry.",
      "Upstream sources, versioning and licensing must be reviewed before implementation.",
    ],
    supportedFormats: ["boot", "init_boot"],
    supportedHeaderVersions: [0, 1, 2, 3, 4],
    supportedArchitectures: ["arm64"],
  },
  {
    id: "apatch",
    name: "APatch",
    description: "KernelPatch based patching with its own artifact family.",
    status: "planned",
    website: "https://github.com/bmax121/APatch",
    notes: [
      "Not implemented in this build.",
      "APatch patches through KernelPatch, whose version must be tracked as a separate artifact rather than folded into a single version field.",
      "Upstream sources, versioning and licensing must be reviewed before implementation.",
    ],
    supportedFormats: ["boot", "init_boot"],
    supportedHeaderVersions: [0, 1, 2, 3, 4],
    supportedArchitectures: ["arm64"],
  },
];
