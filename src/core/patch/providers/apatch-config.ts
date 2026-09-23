import { APATCH_KPIMG_ASTER_ID, APATCH_KPIMG_FOLK_ID, APATCH_KPIMG_ID } from "../../artifacts/catalog";

/**
 * Everything about the APatch provider that other layers need but that does not need the
 * implementation: the plan configuration keys, the registered flavours and the naming used by a
 * custom core image. `apatch-provider.ts` imports this file, so a bundle that only shows or plans
 * a flavour never pulls in the KernelPatch tooling.
 */

/** Plan configuration key holding an optional superkey. Empty means the APatch default. */
export const APATCH_SUPERKEY_SETTING = "superkey";

/** Plan configuration key selecting which KernelPatch core image is injected. */
export const APATCH_FLAVOR_SETTING = "kernelPatchFlavor";

/** Plan configuration key listing the KernelPatch modules embedded into the image. */
export const APATCH_KPM_SETTING = "kpmModules";

export interface ApatchFlavor {
  id: string;
  label: string;
  artifactId: string;
  /** The manager package the injected KernelPatch trusts. */
  managerPackage: string;
  source: string;
}

export const APATCH_FLAVORS: ApatchFlavor[] = [
  {
    id: "upstream",
    label: "Upstream KernelPatch",
    artifactId: APATCH_KPIMG_ID,
    managerPackage: "me.bmax.apatch",
    source: "official APatch release 11224 (KernelPatch 0.13.3)",
  },
  {
    id: "aster",
    label: "Aster fork",
    artifactId: APATCH_KPIMG_ASTER_ID,
    managerPackage: "me.yuki.aster",
    source:
      "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981 (upstream 0.13.8 plus the Aster manager trust commit)",
  },
  {
    id: "folkpatch",
    label: "FolkPatch",
    artifactId: APATCH_KPIMG_FOLK_ID,
    managerPackage: "me.yuki.folk",
    source:
      "LyraVoid/KernelPatch 1de1a37304406615a3c3b6f1d28d2cd926b93a0f (release 0.13.8 of the extended branch FolkPatch is built on)",
  },
];

export const APATCH_DEFAULT_FLAVOR = "upstream";

/** A flavour whose core image is supplied with the run instead of coming from the registry. */
export const APATCH_CUSTOM_FLAVOR = "custom";

export const APATCH_CUSTOM_KPIMG_ID = "custom-kpimg";
