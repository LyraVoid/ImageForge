import { existsSync, readFileSync } from "node:fs";
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

export function readStockImage(): Uint8Array {
  return new Uint8Array(readFileSync(STOCK_IMAGE_PATH));
}

export function readAsterDump(): Uint8Array {
  return new Uint8Array(readFileSync(ASTER_DUMP_PATH));
}
