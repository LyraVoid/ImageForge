/**
 * The reference bzip2 decompressor, compiled to WebAssembly.
 *
 * OTA payloads carry partitions as `REPLACE_BZ` operations, and those streams are whatever the
 * vendor's tooling wrote. The pure Rust decoder this project first used rejects a real stream from a
 * CPH2723 full OTA that the reference tool reads without complaint, so the reference implementation
 * is what decodes them: `public/wasm/bzip2.wasm` is built from bzip2 1.0.8 plus a small shim by
 * `scripts/build-bzip2-wasm.sh`, the same way `lz4.wasm` is built from liblz4. The Rust decoder
 * stays as the fallback for a browser that cannot load the module.
 */
export const BZIP2_WASM_PATH = "/wasm/bzip2.wasm";
export const BZIP2_REFERENCE_VERSION = "1.0.8";

interface Bzip2Exports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  malloc(size: number): number;
  free(pointer: number): void;
  bz2_decompress(
    source: number,
    sourceLength: number,
    destination: number,
    destinationCapacity: number,
  ): number | bigint;
}

export interface Bzip2Codec {
  readonly path: string;
  readonly version: string;
  /** Expands a bzip2 stream, growing the destination until the reference decoder fits. */
  decompress(input: Uint8Array, capacityHint?: number): Uint8Array;
}

async function instantiateBzip2(): Promise<Bzip2Codec | null> {
  if (typeof WebAssembly === "undefined" || typeof fetch === "undefined") return null;
  try {
    const response = await fetch(BZIP2_WASM_PATH);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    const result =
      typeof WebAssembly.instantiateStreaming === "function" && contentType.includes("application/wasm")
        ? await WebAssembly.instantiateStreaming(response, {})
        : await WebAssembly.instantiate(await response.arrayBuffer(), {});
    const exports = result.instance.exports as unknown as Bzip2Exports;
    // The module is built with the WASI reactor model, so libc has to be initialised once.
    exports._initialize?.();

    return {
      path: BZIP2_WASM_PATH,
      version: BZIP2_REFERENCE_VERSION,
      decompress(input: Uint8Array, capacityHint = 0): Uint8Array {
        const sourceSize = Math.max(1, input.length);
        const source = exports.malloc(sourceSize);
        if (source === 0) throw new Error("bzip2 wasm: allocation failed.");
        new Uint8Array(exports.memory.buffer, source, input.length).set(input);
        try {
          let capacity = Math.max(64 * 1024, capacityHint, input.length * 3);
          for (let attempt = 0; attempt < 16; attempt += 1) {
            const allocated = capacity;
            const destination = exports.malloc(allocated);
            if (destination === 0) throw new Error("bzip2 wasm: allocation failed.");
            try {
              const written = Number(
                exports.bz2_decompress(source, input.length, destination, allocated),
              );
              if (written === -2) {
                capacity = allocated * 2;
                continue;
              }
              if (written < 0) throw new Error("bzip2 wasm: the stream is malformed or truncated.");
              return new Uint8Array(exports.memory.buffer, destination, written).slice();
            } finally {
              exports.free(destination);
            }
          }
          throw new Error("bzip2 wasm: the stream needs more memory than this build can give it.");
        } finally {
          exports.free(source);
        }
      },
    };
  } catch {
    return null;
  }
}

let pending: Promise<Bzip2Codec | null> | null = null;

export function loadBzip2Codec(): Promise<Bzip2Codec | null> {
  if (!pending) pending = instantiateBzip2();
  return pending;
}

export function resetBzip2Codec(): void {
  pending = null;
}
