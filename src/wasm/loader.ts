import { WASM_PATH } from "./abi";
import type { WasmImageModule, WasmStatus } from "./abi";
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
}

function versionString(raw: number): string {
  const major = (raw >>> 16) & 0xff;
  const minor = (raw >>> 8) & 0xff;
  const patch = raw & 0xff;
  return major + "." + minor + "." + patch;
}

async function instantiate(): Promise<WasmExports | null> {
  if (typeof WebAssembly === "undefined" || typeof fetch === "undefined") return null;
  try {
    const response = await fetch(WASM_PATH);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (typeof WebAssembly.instantiateStreaming === "function" && contentType.includes("application/wasm")) {
      const streamed = await WebAssembly.instantiateStreaming(response, {});
      return streamed.instance.exports as unknown as WasmExports;
    }
    const buffer = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(buffer, {});
    return result.instance.exports as unknown as WasmExports;
  } catch {
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
  };
}

let pending: Promise<WasmImageModule> | null = null;

export function loadWasmModule(): Promise<WasmImageModule> {
  if (!pending) {
    pending = instantiate()
      .then((exports) => (exports ? createWasmModule(exports) : createTypeScriptModule()))
      .catch(() => createTypeScriptModule());
  }
  return pending;
}

export function resetWasmModule(): void {
  pending = null;
}
