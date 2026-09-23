/**
 * The KernelSU provider's plan configuration keys, entry names, manager flavours and the KMI
 * sentinel handling. Kept apart from the implementation for the same reason as the APatch one:
 * planning a KernelSU patch must not need the ramdisk patching code.
 */
import {
  KERNELSU_KSUINIT_ID,
  kernelsuFamilyKsuinitId,
  kernelsuFamilyLkmId,
  kernelsuLkmId,
} from "../../artifacts/catalog";

/** Plan configuration key holding the device KMI, for example android15-6.6. */
export const KERNELSU_KMI_SETTING = "kmi";

/** Plan configuration key holding extra ksud flags, for example "norc=1 allow_shell=1". */
export const KERNELSU_CONFIG_SETTING = "ksuConfig";

/** Entry names, exactly as ksud writes them. */
export const KERNELSU_INIT_ENTRY = "init";
export const KERNELSU_INIT_BACKUP_ENTRY = "init.real";
export const KERNELSU_MODULE_ENTRY = "kernelsu.ko";
export const KERNELSU_CONFIG_ENTRY = "ksu_config";

export const KERNELSU_MODULE_NAME = "kernelsu";

/** Plan configuration key selecting which manager of the family the patch is made for. */
export const KERNELSU_FLAVOR_SETTING = "kernelsuManager";

/**
 * One manager of the KernelSU family. They share the injection algorithm — `init` becomes
 * `init.real`, a wrapper takes its place and a module is written next to it — and differ in the
 * wrapper, the modules, the app that trusts them, and a few lines of configuration. Each module is
 * compiled against its own manager's signing certificate, so the two cannot be mixed: a run is
 * always one manager's wrapper with that manager's modules.
 */
export interface KernelsuFlavor {
  id: string;
  label: string;
  /** The manager package the wrapper and the modules trust. */
  managerPackage: string;
  ksuinitArtifactId: string;
  /** The artifact id of the loadable module for a KMI. */
  lkmArtifactId: (kmi: string) => string;
  source: string;
  /**
   * `ksu_config` entries the patcher of this manager adds by itself when it writes the module that
   * came with it, rather than one the user supplied.
   */
  bundledModuleConfig: readonly string[];
  /** The legacy ramdisk entry this manager's patcher removes; most use upstream's name. */
  legacyEntry: string;
  /**
   * Whether the module carries the patcher's early boot settings (a 512 byte imgpatch config and a
   * SuperKey block) that have to be written into it before it is added to the ramdisk.
   */
  injectModuleConfig: boolean;
}

export const KERNELSU_FLAVORS: KernelsuFlavor[] = [
  {
    id: "kernelsu",
    label: "KernelSU",
    managerPackage: "me.weishu.kernelsu",
    ksuinitArtifactId: KERNELSU_KSUINIT_ID,
    lkmArtifactId: kernelsuLkmId,
    source: "official KernelSU release v3.3.0",
    bundledModuleConfig: [],
    legacyEntry: "allow_shell",
    injectModuleConfig: false,
  },
  {
    id: "sukisu",
    label: "SukiSU",
    managerPackage: "com.sukisu.ultra",
    ksuinitArtifactId: kernelsuFamilyKsuinitId("sukisu"),
    lkmArtifactId: (kmi) => kernelsuFamilyLkmId("sukisu", kmi),
    source: "SukiSU-Ultra release v4.2.0 (the same wrapper as upstream, its own modules)",
    bundledModuleConfig: [],
    legacyEntry: "allow_shell",
    injectModuleConfig: false,
  },
  {
    id: "resukisu",
    label: "ReSukiSU",
    managerPackage: "com.resukisu.resukisu",
    ksuinitArtifactId: kernelsuFamilyKsuinitId("resukisu"),
    lkmArtifactId: (kmi) => kernelsuFamilyLkmId("resukisu", kmi),
    source: "ReSukiSU release v4.2.0-rc3 (wrapper and modules recovered from its APK)",
    bundledModuleConfig: ["bundled=1"],
    legacyEntry: "allow_shell",
    injectModuleConfig: false,
  },
  {
    id: "yukisu",
    label: "YukiSU",
    managerPackage: "com.anatdx.yukisu",
    ksuinitArtifactId: kernelsuFamilyKsuinitId("yukisu"),
    lkmArtifactId: (kmi) => kernelsuFamilyLkmId("yukisu", kmi),
    source: "YukiSU release v1.7.0 (its modules are release assets, its wrapper comes from its APK)",
    bundledModuleConfig: ["bundled=1"],
    legacyEntry: "ksu_allow_shell",
    injectModuleConfig: true,
  },
  {
    id: "kowsu",
    label: "KowSU",
    managerPackage: "com.kowx712.supermanager",
    ksuinitArtifactId: kernelsuFamilyKsuinitId("kowsu"),
    lkmArtifactId: (kmi) => kernelsuFamilyLkmId("kowsu", kmi),
    source: "KowSU Manager build 32737 (wrapper and modules recovered from its APK)",
    bundledModuleConfig: ["bundled=1"],
    legacyEntry: "allow_shell",
    injectModuleConfig: false,
  },
];

export const KERNELSU_DEFAULT_FLAVOR = "kernelsu";

/** The manager package the default flavour trusts; the one a plan records when nothing is chosen. */
export const KERNELSU_REQUIRED_MANAGER = KERNELSU_FLAVORS[0].managerPackage;

/** The flavour a plan names, or the default one when it names nothing this build knows. */
export function kernelsuFlavor(id: string | undefined): KernelsuFlavor {
  return KERNELSU_FLAVORS.find((flavor) => flavor.id === id) ?? KERNELSU_FLAVORS[0];
}

/**
 * The KMI a plan pins, or an empty string when it has not been chosen yet. The plan stores the
 * sentinel "unset" so it can be displayed, but nothing outside the plan should ever have to know
 * that: this turns it back into "not chosen".
 */
export function plannedKmi(configuration: Record<string, string> | undefined): string {
  const value = (configuration?.[KERNELSU_KMI_SETTING] ?? "").trim();
  return value === "unset" || value === "none" ? "" : value;
}
