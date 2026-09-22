/**
 * The Magisk provider's option keys, the entry names its patcher writes and the configuration file
 * it reads at boot. Pure data and one string builder, so the patch page can offer the options
 * without importing the ramdisk patcher.
 */

/** Options the patch page can set for Magisk. */
export const MAGISK_KEEP_VERITY_SETTING = "keepVerity";
export const MAGISK_KEEP_FORCE_ENCRYPT_SETTING = "keepForceEncrypt";
export const MAGISK_PREINIT_DEVICE_SETTING = "preinitDevice";

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

export const MAGISK_REQUIRED_MANAGER = "com.topjohnwu.magisk";

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
