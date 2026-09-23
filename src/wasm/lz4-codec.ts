/**
 * The reference LZ4 block codec (liblz4) compiled to WebAssembly.
 *
 * Device images have to come back out of this tool in the container bytes the bootloader and the
 * official patchers expect, so the compressor is upstream liblz4 itself rather than a
 * reimplementation: `public/wasm/lz4.wasm` is built from the pinned v1.10.0 sources by
 * `scripts/build-lz4-wasm.sh`, the same revision magiskboot links (lz4-sys 1.11.1+lz4-1.10.0 in
 * Magisk v30.7). Compression is therefore byte for byte what `lz4 -12` produces; where the module
 * cannot be loaded — including when the bytes do not match the digest it is registered with in
 * ./assets — `encodeLz4` falls back to the hand written encoder in the Rust module.
 */
import { LZ4_WASM, fetchWasmAsset } from "./assets";

export const LZ4_WASM_PATH = LZ4_WASM.path;

/** magiskboot passes LZ4HC_CLEVEL_MAX (12); the reference tool's `-12` is the same setting. */
export const LZ4_HC_MAX_LEVEL = 12;

export const LZ4_REFERENCE_VERSION = "1.10.0";

interface Lz4Exports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  malloc(size: number): number;
  free(pointer: number): void;
  LZ4_versionNumber(): number;
  LZ4_compressBound(sourceLength: number): number;
  LZ4_compress_HC(
    source: number,
    destination: number,
    sourceLength: number,
    destinationCapacity: number,
    level: number,
  ): number;
}

export interface Lz4Codec {
  readonly path: string;
  readonly version: string;
  /** One block, exactly as the reference implementation writes it. */
  compressBlockHC(input: Uint8Array, level?: number): Uint8Array;
}

function versionString(raw: number): string {
  const major = Math.floor(raw / 10000);
  const minor = Math.floor(raw / 100) % 100;
  const patch = raw % 100;
  return major + "." + minor + "." + patch;
}

async function instantiateLz4(): Promise<Lz4Codec | null> {
  if (typeof WebAssembly === "undefined") return null;
  // Verified against the record before it runs, and read as bytes rather than streamed: the digest
  // has to be seen first.
  const loaded = await fetchWasmAsset(LZ4_WASM);
  if (!loaded.ok) return null;
  try {
    const result = await WebAssembly.instantiate(loaded.bytes as unknown as BufferSource, {});
    const exports = result.instance.exports as unknown as Lz4Exports;
    // The module is built with the WASI reactor model, so libc has to be initialised once.
    exports._initialize?.();
    if (typeof exports.LZ4_compress_HC !== "function") return null;

    return {
      path: LZ4_WASM_PATH,
      version: versionString(exports.LZ4_versionNumber()),
      compressBlockHC(input: Uint8Array, level = LZ4_HC_MAX_LEVEL): Uint8Array {
        const source = exports.malloc(Math.max(1, input.length));
        const capacity = Math.max(16, exports.LZ4_compressBound(input.length));
        const destination = exports.malloc(capacity);
        if (source === 0 || destination === 0) {
          if (source !== 0) exports.free(source);
          if (destination !== 0) exports.free(destination);
          throw new Error("liblz4 wasm: allocation failed.");
        }
        try {
          // Views are created after the allocations: growing the memory detaches earlier ones.
          new Uint8Array(exports.memory.buffer, source, input.length).set(input);
          const written = exports.LZ4_compress_HC(source, destination, input.length, capacity, level);
          if (written <= 0) throw new Error("liblz4 wasm: compression failed.");
          return new Uint8Array(exports.memory.buffer, destination, written).slice();
        } finally {
          exports.free(source);
          exports.free(destination);
        }
      },
    };
  } catch {
    return null;
  }
}

let pending: Promise<Lz4Codec | null> | null = null;

export function loadLz4Codec(): Promise<Lz4Codec | null> {
  if (!pending) pending = instantiateLz4();
  return pending;
}

export function resetLz4Codec(): void {
  pending = null;
}
