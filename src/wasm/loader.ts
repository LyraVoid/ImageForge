import { WASM_PATH } from "./abi";
import type { WasmImageModule, WasmStatus } from "./abi";
import { IMAGEFORGE_WASM, fetchWasmAsset } from "./assets";
import { createTypeScriptModule } from "./fallback";

interface WasmExports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(pointer: number, size: number): void;
  imageforge_version(): number;
  imageforge_crc32(pointer: number, length: number): number;
  imageforge_lz4_block_max_size(sourceLength: number): number;
  imageforge_lz4_decompress_block(
    source: number,
    sourceLength: number,
    destination: number,
    destinationCapacity: number,
    prefixLength: number,
  ): number | bigint;
  imageforge_lz4_compress_block(
    source: number,
    sourceLength: number,
    destination: number,
    destinationCapacity: number,
  ): number | bigint;
  imageforge_xz_compress_bound(sourceLength: number): number;
  imageforge_xz_compress(
    source: number,
    sourceLength: number,
    destination: number,
    destinationCapacity: number,
  ): number | bigint;
  imageforge_xz_decompress(
    source: number,
    sourceLength: number,
    destination: number,
    destinationCapacity: number,
  ): number | bigint;
  imageforge_bzip2_decompress(
    source: number,
    sourceLength: number,
    destination: number,
    destinationCapacity: number,
  ): number | bigint;
}

function versionString(raw: number): string {
  const major = (raw >>> 16) & 0xff;
  const minor = (raw >>> 8) & 0xff;
  const patch = raw & 0xff;
  return major + "." + minor + "." + patch;
}

/** Why the module is not in use, in the words the status reports to the diagnostics page. */
let unavailableReason: string | undefined;

async function instantiate(): Promise<WasmExports | null> {
  if (typeof WebAssembly === "undefined") {
    unavailableReason = "This runtime has no WebAssembly support.";
    return null;
  }
  // Verified against the record before it runs, and read as bytes rather than streamed: the digest
  // has to be seen first, and the module is a fifth of a megabyte.
  const loaded = await fetchWasmAsset(IMAGEFORGE_WASM);
  if (!loaded.ok) {
    unavailableReason = loaded.reason;
    return null;
  }
  try {
    const result = await WebAssembly.instantiate(loaded.bytes as unknown as BufferSource, {});
    return result.instance.exports as unknown as WasmExports;
  } catch (error) {
    unavailableReason =
      "The WebAssembly module could not be instantiated: " +
      (error instanceof Error ? error.message : String(error));
    return null;
  }
}

function createWasmModule(exports: WasmExports): WasmImageModule {
  const status: WasmStatus = {
    available: true,
    path: WASM_PATH,
    version: versionString(exports.imageforge_version()),
  };

  const writeHeap = (bytes: Uint8Array): { pointer: number; size: number } => {
    const size = Math.max(1, bytes.length);
    const pointer = exports.alloc(size);
    if (pointer === 0) throw new Error("imageforge wasm: allocation failed.");
    new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
    return { pointer, size: bytes.length };
  };

  return {
    kind: "wasm",
    status,
    crc32(bytes: Uint8Array): number {
      if (bytes.length === 0) return 0;
      const { pointer, size } = writeHeap(bytes);
      try {
        return exports.imageforge_crc32(pointer, size) >>> 0;
      } finally {
        exports.dealloc(pointer, Math.max(1, size));
      }
    },
    lz4BlockMaxSize(sourceLength: number): number {
      return exports.imageforge_lz4_block_max_size(sourceLength);
    },
    lz4DecompressBlock(input: Uint8Array, expectedSize: number, prefix?: Uint8Array): Uint8Array {
      const prefixLength = prefix ? prefix.length : 0;
      const source = writeHeap(input);
      const destinationSize = prefixLength + Math.max(1, expectedSize);
      const destination = exports.alloc(destinationSize);
      if (destination === 0) {
        exports.dealloc(source.pointer, Math.max(1, source.size));
        throw new Error("imageforge wasm: allocation failed.");
      }
      try {
        if (prefix && prefixLength > 0) {
          new Uint8Array(exports.memory.buffer, destination, prefixLength).set(prefix);
        }
        const written = Number(
          exports.imageforge_lz4_decompress_block(
            source.pointer,
            source.size,
            destination,
            destinationSize,
            prefixLength,
          ),
        );
        if (written < 0) throw new Error("Invalid LZ4 block.");
        return new Uint8Array(exports.memory.buffer, destination + prefixLength, written).slice();
      } finally {
        exports.dealloc(source.pointer, Math.max(1, source.size));
        exports.dealloc(destination, destinationSize);
      }
    },
    lz4CompressBlock(input: Uint8Array): Uint8Array {
      const capacity = Math.max(16, exports.imageforge_lz4_block_max_size(input.length));
      const source = writeHeap(input);
      const destination = exports.alloc(capacity);
      if (destination === 0) {
        exports.dealloc(source.pointer, Math.max(1, source.size));
        throw new Error("imageforge wasm: allocation failed.");
      }
      try {
        const written = Number(
          exports.imageforge_lz4_compress_block(source.pointer, source.size, destination, capacity),
        );
        if (written < 0) throw new Error("imageforge wasm: LZ4 compression failed.");
        return new Uint8Array(exports.memory.buffer, destination, written).slice();
      } finally {
        exports.dealloc(source.pointer, Math.max(1, source.size));
        exports.dealloc(destination, capacity);
      }
    },
    xzDecompress(input: Uint8Array): Uint8Array {
      const source = writeHeap(input);
      let capacity = Math.max(64 * 1024, input.length * 4);
      try {
        for (let attempt = 0; attempt < 16; attempt += 1) {
          // The size the block was allocated with, so a retry frees exactly that and not the grown
          // request: freeing with the wrong size corrupts the module's allocator.
          const allocated = capacity;
          const destination = exports.alloc(allocated);
          if (destination === 0) throw new Error("imageforge wasm: allocation failed.");
          try {
            const written = Number(
              exports.imageforge_xz_decompress(source.pointer, source.size, destination, allocated),
            );
            if (written === -2) {
              capacity = allocated * 2;
              continue;
            }
            if (written < 0) throw new Error("imageforge wasm: XZ decompression failed.");
            return new Uint8Array(exports.memory.buffer, destination, written).slice();
          } finally {
            exports.dealloc(destination, allocated);
          }
        }
        throw new Error("imageforge wasm: the XZ payload needs more memory than this build can give it.");
      } finally {
        exports.dealloc(source.pointer, Math.max(1, source.size));
      }
    },
    bzip2Decompress(input: Uint8Array, capacityHint = 0): Uint8Array {
      const source = writeHeap(input);
      let capacity = Math.max(64 * 1024, capacityHint, input.length * 4);
      try {
        for (let attempt = 0; attempt < 16; attempt += 1) {
          const allocated = capacity;
          const destination = exports.alloc(allocated);
          if (destination === 0) throw new Error("imageforge wasm: allocation failed.");
          try {
            const written = Number(
              exports.imageforge_bzip2_decompress(source.pointer, source.size, destination, allocated),
            );
            if (written === -2) {
              // Free the block with the size it was allocated with before asking for a bigger one.
              capacity = allocated * 2;
              continue;
            }
            if (written < 0) throw new Error("imageforge wasm: the bzip2 stream is malformed.");
            return new Uint8Array(exports.memory.buffer, destination, written).slice();
          } finally {
            exports.dealloc(destination, allocated);
          }
        }
        throw new Error("imageforge wasm: the bzip2 stream needs more memory than this build can give it.");
      } catch (error) {
        // A trap poisons the instance, so it is dropped: the next call instantiates a clean module.
        resetWasmModule();
        throw error instanceof Error ? error : new Error(String(error));
      } finally {
        try {
          exports.dealloc(source.pointer, Math.max(1, source.size));
        } catch {
          // the instance is gone; there is nothing left to free
        }
      }
    },
    xzCompress(input: Uint8Array): Uint8Array {
      const capacity = Math.max(64, Number(exports.imageforge_xz_compress_bound(input.length)));
      const source = writeHeap(input);
      const destination = exports.alloc(capacity);
      if (destination === 0) {
        exports.dealloc(source.pointer, Math.max(1, source.size));
        throw new Error("imageforge wasm: allocation failed.");
      }
      try {
        const written = Number(exports.imageforge_xz_compress(source.pointer, source.size, destination, capacity));
        if (written < 0) throw new Error("imageforge wasm: XZ compression failed.");
        return new Uint8Array(exports.memory.buffer, destination, written).slice();
      } finally {
        exports.dealloc(source.pointer, Math.max(1, source.size));
        exports.dealloc(destination, capacity);
      }
    },
  };
}

let pending: Promise<WasmImageModule> | null = null;

export function loadWasmModule(): Promise<WasmImageModule> {
  if (!pending) {
    pending = instantiate()
      .then((exports) => (exports ? createWasmModule(exports) : createTypeScriptModule(unavailableReason)))
      .catch((error) =>
        createTypeScriptModule(
          unavailableReason ?? (error instanceof Error ? error.message : String(error)),
        ),
      );
  }
  return pending;
}

export function resetWasmModule(): void {
  pending = null;
}
