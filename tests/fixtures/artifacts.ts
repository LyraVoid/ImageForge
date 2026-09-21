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
