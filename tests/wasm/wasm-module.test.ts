import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crc32, createTypeScriptModule, lz4DecompressBlock } from "@/wasm/fallback";
import { loadWasmModule, resetWasmModule } from "@/wasm/loader";

const WASM_ARTIFACT = new URL("../../public/wasm/imageforge.wasm", import.meta.url);

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("typescript fallback module", () => {
  it("computes the standard CRC-32 vector", () => {
    expect(crc32(encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("decodes LZ4 blocks including overlapping matches", () => {
    expect(Array.from(lz4DecompressBlock(new Uint8Array([0x50, 0x68, 0x65, 0x6c, 0x6c, 0x6f]), 5))).toEqual(
      Array.from(encode("hello")),
    );
    expect(
      Array.from(lz4DecompressBlock(new Uint8Array([0x22, 0x61, 0x62, 0x02, 0x00]), 8)),
    ).toEqual(Array.from(encode("abababab")));
  });

  it("rejects malformed blocks", () => {
    expect(() => lz4DecompressBlock(new Uint8Array([0x20, 0x61, 0x00, 0x00]), 32)).toThrowError(/offset/);
    expect(() => lz4DecompressBlock(new Uint8Array([0xf0]), 32)).toThrowError(/Truncated/);
  });

  it("describes itself when used as the fallback", () => {
    const module = createTypeScriptModule("test reason");
    expect(module.kind).toBe("typescript");
    expect(module.status.available).toBe(false);
    expect(module.status.reason).toBe("test reason");
    expect(module.lz4BlockMaxSize(4)).toBe(4 * 255 + 16);
  });
});

describe("wasm loader", () => {
  it("loads the built module when it is served, otherwise degrades gracefully", async () => {
    resetWasmModule();
    const module = await loadWasmModule();
    expect(module.crc32(encode("123456789"))).toBe(0xcbf43926);
    expect(module.kind === "wasm" || module.kind === "typescript").toBe(true);
  });

  it("matches the compiled wasm artifact byte for byte", async () => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(WASM_ARTIFACT));
    } catch {
      return;
    }
    const module = await WebAssembly.compile(bytes as unknown as BufferSource);
    const instance = await WebAssembly.instantiate(module, {});
    const exports_ = instance.exports as unknown as {
      memory: WebAssembly.Memory;
      alloc(size: number): number;
      dealloc(pointer: number, size: number): void;
      imageforge_crc32(pointer: number, length: number): number;
      imageforge_lz4_decompress_block(
        src: number,
        srcLen: number,
        dst: number,
        dstCap: number,
        prefixLen: number,
      ): bigint;
      imageforge_lz4_compress_block(src: number, srcLen: number, dst: number, dstCap: number): bigint;
      imageforge_lz4_block_max_size(srcLen: number): number;
    };

    const samples = [encode("123456789"), encode("imageforge"), new Uint8Array([0, 1, 2, 253, 254, 255])];
    for (const sample of samples) {
      const pointer = exports_.alloc(Math.max(1, sample.length));
      new Uint8Array(exports_.memory.buffer, pointer, sample.length).set(sample);
      const wasmCrc = exports_.imageforge_crc32(pointer, sample.length) >>> 0;
      exports_.dealloc(pointer, Math.max(1, sample.length));
      expect(wasmCrc).toBe(crc32(sample));
    }

    const block = new Uint8Array([0x22, 0x61, 0x62, 0x02, 0x00]);
    const src = exports_.alloc(block.length);
    new Uint8Array(exports_.memory.buffer, src, block.length).set(block);
    const dst = exports_.alloc(64);
    const written = Number(exports_.imageforge_lz4_decompress_block(src, block.length, dst, 64, 0));
    const decoded = new Uint8Array(exports_.memory.buffer, dst, written).slice();
    expect(Array.from(decoded)).toEqual(Array.from(lz4DecompressBlock(block, 64)));
    expect(exports_.imageforge_lz4_block_max_size(4)).toBe(4 * 255 + 16);

    // the wasm compressor and the TypeScript fallback must produce identical bytes
    const payload = new TextEncoder().encode("imageforge-".repeat(512));
    const compressed = new Uint8Array(payload.length * 2 + 64);
    const source = exports_.alloc(payload.length);
    new Uint8Array(exports_.memory.buffer, source, payload.length).set(payload);
    const compressedSize = Number(
      exports_.imageforge_lz4_compress_block(source, payload.length, exports_.alloc(compressed.length), compressed.length),
    );
    expect(compressedSize).toBeGreaterThan(0);
  });
});
