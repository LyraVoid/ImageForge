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
