/**
 * The manager apps a produced image needs, and where their official releases live.
 *
 * A patch only works with the manager that trusts it, so the result page has to say which app to
 * install and how to get it. The package names here are the ones the providers record in the plan and
 * the metadata; the release URLs are the upstream projects' own release pages, checked to answer
 * HTTP 200 when this module was written (Magisk, KernelSU, APatch, KernelPatch-Aster and
 * FolkPatch).
 */
export interface ManagerApp {
  packageName: string;
  /** The upstream project's name, as its own releases call it. */
  name: string;
  /** The official release page of that project. */
  releaseUrl: string;
}

export const MANAGER_APPS: ManagerApp[] = [
  {
    packageName: "com.topjohnwu.magisk",
    name: "Magisk",
    releaseUrl: "https://github.com/topjohnwu/Magisk/releases",
  },
  {
    packageName: "me.weishu.kernelsu",
    name: "KernelSU",
    releaseUrl: "https://github.com/tiann/KernelSU/releases",
  },
  {
    packageName: "me.bmax.apatch",
    name: "APatch",
    releaseUrl: "https://github.com/bmax121/APatch/releases",
  },
  {
    packageName: "me.yuki.aster",
    name: "KernelPatch-Aster",
    releaseUrl: "https://github.com/LyraVoid/KernelPatch-Aster/releases",
  },
  {
    packageName: "me.yuki.folk",
    name: "FolkPatch",
    releaseUrl: "https://github.com/LyraVoid/FolkPatch/releases",
  },
  {
    packageName: "io.github.seyud.weave",
    name: "WeaveMask",
    releaseUrl: "https://github.com/Seyud/WeaveMask/releases",
  },
];

/** The manager app that owns a package name, or undefined for a hand-supplied core image. */
export function managerApp(packageName: string): ManagerApp | undefined {
  return MANAGER_APPS.find((entry) => entry.packageName === packageName);
}
