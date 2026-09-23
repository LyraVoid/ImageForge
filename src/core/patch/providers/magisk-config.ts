/**
 * The Magisk provider's option keys, the entry names its patcher writes and the configuration file
 * it reads at boot. Pure data and one string builder, so the patch page can offer the options
 * without importing the ramdisk patcher.
 */
import {
  MAGISK_INIT_LD_PAYLOAD_ID,
  MAGISK_MAGISKINIT_ID,
  MAGISK_MAGISK_PAYLOAD_ID,
  MAGISK_STUB_PAYLOAD_ID,
  WEAVEMASK_INIT_LD_PAYLOAD_ID,
  WEAVEMASK_MAGISKINIT_ID,
  WEAVEMASK_MAGISK_PAYLOAD_ID,
  WEAVEMASK_STUB_PAYLOAD_ID,
} from "../../artifacts/catalog";

/** Options the patch page can set for Magisk. */
export const MAGISK_KEEP_VERITY_SETTING = "keepVerity";
export const MAGISK_KEEP_FORCE_ENCRYPT_SETTING = "keepForceEncrypt";
export const MAGISK_PREINIT_DEVICE_SETTING = "preinitDevice";

/** Plan configuration key selecting which Magisk-compatible manager the payloads come from. */
export const MAGISK_FLAVOR_SETTING = "magiskFlavor";

/** Entries, exactly as Magisk's own patcher writes them. */
export const MAGISK_INIT_ENTRY = "init";
export const MAGISK_OVERLAY_DIR = "overlay.d";
export const MAGISK_OVERLAY_SBIN_DIR = "overlay.d/sbin";
export const MAGISK_MAGISK_ENTRY = "overlay.d/sbin/magisk.xz";
export const MAGISK_STUB_ENTRY = "overlay.d/sbin/stub.xz";
export const MAGISK_INIT_LD_ENTRY = "overlay.d/sbin/init-ld.xz";
export const MAGISK_BACKUP_DIR = ".backup";
export const MAGISK_CONFIG_ENTRY = ".backup/.magisk";
export const MAGISK_VERITY_KEY_ENTRY = "verity_key";
export const MAGISK_BACKUP_INIT_ENTRY = ".backup/init.xz";
export const MAGISK_BACKUP_RMLIST_ENTRY = ".backup/.rmlist";

/** The four payload artifacts one manager ships, in the order its patcher writes them. */
export interface MagiskFlavorArtifacts {
  magiskinit: string;
  /** The three payloads that go into overlay.d/sbin, compressed at patch time. */
  magisk: string;
  stub: string;
  initLd: string;
}

export interface MagiskFlavor {
  id: string;
  label: string;
  artifacts: MagiskFlavorArtifacts;
  /** The manager package the payloads trust. */
  managerPackage: string;
  source: string;
}

/**
 * Managers whose patcher is Magisk's. They are flavours rather than providers because the algorithm
 * is identical — WeaveMask's `boot_patch.sh` and the ramdisk patcher it drives are byte for byte
 * Magisk v30.7's — and only the payloads and the manager that trusts them differ. That is also why
 * a flavour is a run-wide choice: mixing payloads from two managers produces an image neither app
 * can manage.
 */
export const MAGISK_FLAVORS: MagiskFlavor[] = [
  {
    id: "magisk",
    label: "Magisk",
    artifacts: {
      magiskinit: MAGISK_MAGISKINIT_ID,
      magisk: MAGISK_MAGISK_PAYLOAD_ID,
      stub: MAGISK_STUB_PAYLOAD_ID,
      initLd: MAGISK_INIT_LD_PAYLOAD_ID,
    },
    managerPackage: "com.topjohnwu.magisk",
    source: "official Magisk release v30.7",
  },
  {
    id: "weavemask",
    label: "WeaveMask",
    artifacts: {
      magiskinit: WEAVEMASK_MAGISKINIT_ID,
      magisk: WEAVEMASK_MAGISK_PAYLOAD_ID,
      stub: WEAVEMASK_STUB_PAYLOAD_ID,
      initLd: WEAVEMASK_INIT_LD_PAYLOAD_ID,
    },
    managerPackage: "io.github.seyud.weave",
    source: "WeaveMask release v30.7.5, a fork of Magisk",
  },
];

export const MAGISK_DEFAULT_FLAVOR = "magisk";

/** The manager package the default flavour trusts; the one a plan records when nothing is chosen. */
export const MAGISK_REQUIRED_MANAGER = MAGISK_FLAVORS[0].managerPackage;

/** The flavour a plan names, or the default one when it names nothing this build knows. */
export function magiskFlavor(id: string | undefined): MagiskFlavor {
  return MAGISK_FLAVORS.find((flavor) => flavor.id === id) ?? MAGISK_FLAVORS[0];
}

export interface MagiskConfigInput {
  keepVerity: boolean;
  keepForceEncrypt: boolean;
  preinitDevice?: string;
  sha1?: string;
}

/** The configuration file Magisk reads at boot, byte for byte as its patcher writes it. */
export function buildMagiskConfig(input: MagiskConfigInput): Uint8Array {
  const lines = [
    "KEEPVERITY=" + String(input.keepVerity),
    "KEEPFORCEENCRYPT=" + String(input.keepForceEncrypt),
    // RECOVERYMODE is what makes magiskinit treat a keyless boot as a normal boot: with the line set
    // true, init sets skip_initramfs unless the recovery key combination is held, so a Magisk that
    // lives in the recovery ramdisk still boots the system (native/src/init/getinfo.cpp:177). It only
    // makes sense for an image that goes into a recovery partition, and this build offers no such
    // target, so it stays false; the runtime half of the feature is already in the injected magiskinit.
    "RECOVERYMODE=false",
    "VENDORBOOT=false",
  ];
  if (input.preinitDevice !== undefined && input.preinitDevice !== "") {
    lines.push("PREINITDEVICE=" + input.preinitDevice);
  }
  if (input.sha1 !== undefined) lines.push("SHA1=" + input.sha1);
  return new TextEncoder().encode(lines.join("\n") + "\n");
}
