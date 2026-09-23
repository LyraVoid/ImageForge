/**
 * The WebAssembly modules this build fetches, and the digest each one must have.
 *
 * The rule this file serves is the one in AGENTS.md and docs/architecture.md: a bundled artifact is
 * digest verified before it is used, and every bundled artifact is registered with a pinned
 * revision. The modules here used to be the exception — they were fetched and instantiated
 * unverified — so the digests live next to the loaders that consume them, the licence register in
 * `THIRD_PARTY_LICENSES/` records where each one comes from, and `tests/unit/wasm-assets.test.ts`
 * hashes `public/wasm/` so a rebuild that changes a module cannot leave a stale digest here.
 *
 * `kptools.wasm` is deliberately absent: it is a provider artifact rather than a codec, so it is
 * registered in `src/core/artifacts/catalog.ts` (the APatch release, artifact id
 * `apatch-kptools-wasm`) and resolved and verified there before it is compiled.
 */
import { sha256Hex } from "@/core/hash";

export interface WasmAsset {
  /** Stable name used by the tests and the error messages. */
  readonly id: string;
  /** Same-origin path, which is also what the service worker pre-caches. */
  readonly path: string;
  /** SHA-256 of the built module, recorded for the same path in {@link WasmAsset.register}. */
  readonly sha256: string;
  readonly sizeBytes: number;
  /** The register that says where this module comes from and under which licence. */
  readonly register: string;
}

/** Our own module, built from crates/imageforge-wasm by `pnpm wasm:build`. */
export const IMAGEFORGE_WASM: WasmAsset = {
  id: "imageforge-wasm",
  path: "/wasm/imageforge.wasm",
  sha256: "0605b7ae822158da860108de44ced14cea5d3f775dc67d30c065ccfadce19b31",
  sizeBytes: 181833,
  register: "THIRD_PARTY_LICENSES/rust-crates/README.md",
};

/** Upstream liblz4 1.10.0 compiled to `wasm32-wasip1`; see THIRD_PARTY_LICENSES/lz4/. */
export const LZ4_WASM: WasmAsset = {
  id: "lz4-wasm",
  path: "/wasm/lz4.wasm",
  sha256: "c855a8fd6e885b8edae3c8dfece0c213c891116cb61bb685216c3f8c1022b6b7",
  sizeBytes: 92917,
  register: "THIRD_PARTY_LICENSES/lz4/README.md",
};

/** Upstream bzip2 1.0.8's decompressor plus a shim; see THIRD_PARTY_LICENSES/bzip2/. */
export const BZIP2_WASM: WasmAsset = {
  id: "bzip2-wasm",
  path: "/wasm/bzip2.wasm",
  sha256: "d4645c6abdc34c59e30061f46a0490a3b51ca2d03b8cc474f6a99eedd4804196",
  sizeBytes: 73166,
  register: "THIRD_PARTY_LICENSES/bzip2/README.md",
};

/** Every module this layer fetches. kptools is a provider artifact and lives in the catalog. */
export const WASM_ASSETS: readonly WasmAsset[] = [IMAGEFORGE_WASM, LZ4_WASM, BZIP2_WASM];

/**
 * Content addressed, the way `src/core/artifacts/registry.ts` fetches bundled artifacts: without it
 * a stale cache entry whose digest no longer matches the record would be served under the current
 * URL, which looks like tampering rather than a stale deployment.
 */
export function wasmAssetUrl(asset: WasmAsset): string {
  return asset.path + "?v=" + asset.sha256.slice(0, 16);
}

export type WasmAssetResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fetches a registered module and refuses bytes that do not match the record, so no unverified
 * WebAssembly is ever instantiated. A refusal is not fatal: every caller has a fallback and is
 * expected to say why the module is not in use instead of failing quietly.
 */
export async function fetchWasmAsset(asset: WasmAsset): Promise<WasmAssetResult> {
  if (typeof fetch === "undefined") {
    return { ok: false, reason: "This runtime cannot fetch " + asset.path + "." };
  }

  let bytes: Uint8Array;
  try {
    const response = await fetch(wasmAssetUrl(asset));
    if (!response.ok) {
      return { ok: false, reason: asset.path + " responded with status " + response.status + "." };
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return { ok: false, reason: asset.path + " could not be fetched: " + describe(error) + "." };
  }

  if (bytes.length !== asset.sizeBytes) {
    return {
      ok: false,
      reason:
        asset.path +
        " is " +
        bytes.length +
        " bytes, but " +
        asset.register +
        " records " +
        asset.sizeBytes +
        ".",
    };
  }

  let actual: string;
  try {
    actual = await sha256Hex(bytes);
  } catch (error) {
    // No SubtleCrypto, so the digest cannot be checked. Refusing is the honest answer: the rest of
    // the pipeline hashes bytes too, so a runtime without it cannot patch anything anyway.
    return { ok: false, reason: "The digest of " + asset.path + " could not be checked: " + describe(error) };
  }
  if (actual !== asset.sha256) {
    return {
      ok: false,
      reason: asset.path + " hashed to " + actual + " but " + asset.register + " records " + asset.sha256 + ".",
    };
  }

  return { ok: true, bytes };
}
