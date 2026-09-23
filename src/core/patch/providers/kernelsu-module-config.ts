/**
 * The settings YukiSU writes into the loadable module itself.
 *
 * The other managers of the family keep every setting in the ramdisk (`ksu_config`), but YukiSU also
 * stores its early boot settings in the module, in two fixed blocks its patcher finds and rewrites
 * before the module is added to the ramdisk:
 *
 * * a 512 byte `ksu_imgpatch_config` (`uapi/imgpatch_config.h:29-36`), whose magic is the little
 *   endian bytes of `KSU_IMGPATCH_CONFIG_MAGIC` = `0x314746434955534b` ("KSUICFG1"), with the flags
 *   at offset 16: `ALLOW_SHELL` (1<<0), `ENABLE_ADBD` (1<<1), `UTS_BOOT` (1<<2) and `BUNDLED` (1<<3)
 *   (`uapi/imgpatch_config.h:13-22`);
 * * a 40 byte SuperKey block (`userspace/ksud/src/boot/boot_patch.cpp:116-124`) whose magic is
 *   `0x5355504552`, holding a salt, a key hash and the verification mode.
 *
 * YukiSU's patcher rewrites the whole config struct (so the UTS template and the reserved words are
 * zeroed) and always writes the SuperKey block, with zeros when no SuperKey is configured — the
 * "signature only" mode, which is the only mode this build offers (`boot_patch.cpp:126-146`). Its
 * search requires the version and size fields to match as well, and refuses a module with two blocks
 * (`boot_patch.cpp:215-235`), which this reproduces.
 */
import { PatchError } from "../../errors";

const IMGPATCH_MAGIC = 0x314746434955534bn;
const IMGPATCH_VERSION = 1;
const IMGPATCH_SIZE = 512;

const FLAG_ALLOW_SHELL = 1n << 0n;
const FLAG_BUNDLED = 1n << 3n;

const SUPERKEY_MAGIC = 0x5355504552n;
const SUPERKEY_BLOCK_SIZE = 40;

export interface YukisuModuleConfig {
  /** Whether `allow_shell=1` is part of the run's configuration. */
  allowShell: boolean;
  /** Whether the module being written is the one that came with the manager. */
  bundled: boolean;
}

function bigUint64(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

/** The offset of the single imgpatch config block, or -1 when there is none. */
function findConfigBlock(bytes: Uint8Array): number {
  let found = -1;
  for (let offset = 0; offset + IMGPATCH_SIZE <= bytes.length; offset += 1) {
    if (bigUint64(bytes, offset) !== IMGPATCH_MAGIC) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 16);
    if (view.getUint32(8, true) !== IMGPATCH_VERSION || view.getUint32(12, true) !== IMGPATCH_SIZE) continue;
    if (found >= 0) {
      throw new PatchError(
        "The module contains more than one imgpatch configuration block.",
        "This module cannot be used with the YukiSU flavour; attach a module from its own release.",
      );
    }
    found = offset;
  }
  return found;
}

/**
 * Returns a copy of `module` with YukiSU's own settings written into it. The artifact is never
 * modified: the copy is what goes into the ramdisk, so the digest the plan pinned stays the digest of
 * the file that was read.
 */
export function injectYukisuModuleConfig(module: Uint8Array, config: YukisuModuleConfig): Uint8Array {
  const bytes = new Uint8Array(module);

  const block = findConfigBlock(bytes);
  if (block < 0) {
    throw new PatchError(
      "The selected module does not carry the imgpatch configuration block YukiSU writes into its own.",
      "Use the module from the manager's release, or pick another manager.",
    );
  }

  const flags = (config.bundled ? FLAG_BUNDLED : 0n) | (config.allowShell ? FLAG_ALLOW_SHELL : 0n);
  const view = new DataView(bytes.buffer, bytes.byteOffset + block, IMGPATCH_SIZE);
  // The manager writes a freshly built struct: magic, version and size come out unchanged because
  // they were read from the block, while the flags carry the settings and everything after them is
  // zeroed, which clears a UTS template a previous patch may have left there.
  view.setBigUint64(16, flags, true);
  bytes.fill(0, block + 24, block + IMGPATCH_SIZE);

  for (let offset = 0; offset + SUPERKEY_BLOCK_SIZE <= bytes.length; offset += 1) {
    if (bigUint64(bytes, offset) !== SUPERKEY_MAGIC) continue;
    // Signature only: an empty salt, an empty hash and mode 0, which is what the manager writes when
    // no SuperKey is configured.
    bytes.fill(0, offset + 8, offset + SUPERKEY_BLOCK_SIZE);
    break;
  }

  return bytes;
}
