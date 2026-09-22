import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PayloadLoader } from "@/core";

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function repoPath(...parts: string[]): string {
  return join(REPO_ROOT, ...parts);
}

/** Resolves "bundled:" artifact sources against the public/ directory on disk. */
export const fsPayloadLoader: PayloadLoader = async (path) => {
  return new Uint8Array(readFileSync(repoPath("public", path.replace(/^\//, ""))));
};

/** Real device image used by the tests that cannot run on synthetic kernels. */
export const REAL_IMAGE_PATH =
  process.env.IMAGEFORGE_TEST_IMAGE ?? repoPath(".research", "images", "gki-a13-5.10", "boot-5.10.img");

export const hasRealImage = existsSync(REAL_IMAGE_PATH);

export function readRealImage(): Uint8Array {
  return new Uint8Array(readFileSync(REAL_IMAGE_PATH));
}

/**
 * Material for the byte exact reproduction check: a stock boot image and a boot partition
 * dumped from a device flashed with the Aster KernelPatch build.
 */
export const STOCK_IMAGE_PATH =
  process.env.IMAGEFORGE_STOCK_IMAGE ?? repoPath(".research", "aster-validation", "boot.img");

export const ASTER_DUMP_PATH =
  process.env.IMAGEFORGE_ASTER_DUMP ??
  repoPath(".research", "aster-validation", "boot_a-patched.img");

export const hasAsterReproductionMaterial = existsSync(STOCK_IMAGE_PATH) && existsSync(ASTER_DUMP_PATH);

/**
 * A real third-party KernelPatch module. Such modules are usually proprietary, so they are
 * never bundled: the test only runs when one is supplied or found next to the workspace.
 */
function firstModuleOnDisk(): string | undefined {
  const directory = process.env.IMAGEFORGE_KPM_DIR ?? repoPath(".research", "kpm");
  try {
    const entry = readdirSync(directory)
      .filter((name) => name.toLowerCase().endsWith(".kpm"))
      .sort()
      .at(0);
    return entry ? join(directory, entry) : undefined;
  } catch {
    return undefined;
  }
}

export const REAL_KPM_PATH = process.env.IMAGEFORGE_TEST_KPM ?? firstModuleOnDisk();

export const hasRealKpm = REAL_KPM_PATH !== undefined && existsSync(REAL_KPM_PATH);

/** A real init_boot image, used to accept the ramdisk layer and the KernelSU provider. */
export const INIT_BOOT_IMAGE_PATH =
  process.env.IMAGEFORGE_INIT_BOOT ?? repoPath(".research", "aster-validation", "init_boot.img");

export const hasInitBootImage = existsSync(INIT_BOOT_IMAGE_PATH);

export function readInitBootImage(): Uint8Array {
  return new Uint8Array(readFileSync(INIT_BOOT_IMAGE_PATH));
}

/**
 * A real KernelSU loadable module. KernelSU's kernel directory is GPL-2.0-only, so no module is
 * bundled: the test runs only when one is supplied or found next to the workspace.
 */
export const KERNELSU_MODULE_PATH =
  process.env.IMAGEFORGE_KERNELSU_MODULE ??
  repoPath(".research", "kernelsu-release", "v3.3.0", "lkm-aarch64-android15-6.6_kernelsu.ko");

export const hasKernelsuModule = existsSync(KERNELSU_MODULE_PATH);

export function readKernelsuModule(): Uint8Array {
  return new Uint8Array(readFileSync(KERNELSU_MODULE_PATH));
}

/**
 * An image produced by Magisk's own app for the same source image. It is the reference the
 * Magisk provider is compared against, and it is never committed.
 */
export const MAGISK_REFERENCE_PATH =
  process.env.IMAGEFORGE_MAGISK_REFERENCE ??
  repoPath(".research", "magisk-release", "reference", "magisk_patched-30700_7T89w.img");

export const hasMagiskReference = existsSync(MAGISK_REFERENCE_PATH);

export function readMagiskReference(): Uint8Array {
  return new Uint8Array(readFileSync(MAGISK_REFERENCE_PATH));
}

/** A real vendor_boot image, whose ramdisk lives in a platform fragment of a v4 table. */
export const VENDOR_BOOT_PATH =
  process.env.IMAGEFORGE_VENDOR_BOOT ?? repoPath(".research", "aster-validation", "vendor_boot.img");

export const hasVendorBootImage = existsSync(VENDOR_BOOT_PATH);

export function readVendorBootImage(): Uint8Array {
  return new Uint8Array(readFileSync(VENDOR_BOOT_PATH));
}

/** A small GPL demo module taken from the KernelPatch-Aster 0.13.8 release. */
export const DEMO_KPM_PATH = repoPath("tests", "fixtures", "kernelpatch", "demo-hello.kpm");

export function readDemoKpm(): Uint8Array {
  return new Uint8Array(readFileSync(DEMO_KPM_PATH));
}

export function readStockImage(): Uint8Array {
  return new Uint8Array(readFileSync(STOCK_IMAGE_PATH));
}

export function readAsterDump(): Uint8Array {
  return new Uint8Array(readFileSync(ASTER_DUMP_PATH));
}
