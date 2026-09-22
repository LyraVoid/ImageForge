import { describe, expect, it } from "vitest";
import {
  COMPRESSION_LABEL,
  compressGzip,
  compressSection,
  decompress,
  decompressSection,
  describeCompression,
  detectCompression,
  isDecompressionSupported,
} from "@/core/image";
import { encodeLz4 } from "@/core/image/lz4";
import { deterministicBytes } from "../fixtures/bootimg";

describe("compression detection", () => {
  it("recognizes the magic of every supported container", () => {
    const cases: Array<[number[], string]> = [
      [[0x1f, 0x8b, 0x08], "gzip"],
      [[0x02, 0x21, 0x4c, 0x18], "lz4-legacy"],
      [[0x04, 0x22, 0x4d, 0x18], "lz4-frame"],
      [[0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], "xz"],
      [[0x5d, 0x00, 0x00], "lzma"],
      [[0x42, 0x5a, 0x68], "bzip2"],
      [[0x28, 0xb5, 0x2f, 0xfd], "zstd"],
      [[0x30, 0x37, 0x30, 0x37, 0x30], "cpio"],
      [[0xde, 0xad, 0xbe, 0xef], "unknown"],
    ];
    for (const [magic, expected] of cases) {
      expect(detectCompression(new Uint8Array(magic))).toBe(expected);
    }
    expect(detectCompression(new Uint8Array(0))).toBe("none");
  });

  it("marks gzip and both LZ4 containers as expandable", () => {
    expect(isDecompressionSupported("gzip")).toBe(true);
    expect(isDecompressionSupported("lz4-legacy")).toBe(true);
    expect(isDecompressionSupported("lz4-frame")).toBe(true);
    expect(isDecompressionSupported("zstd")).toBe(false);
    // xz is handled by the WebAssembly module, using the same codec settings as magiskboot
    expect(isDecompressionSupported("xz")).toBe(true);
    expect(COMPRESSION_LABEL["lz4-frame"]).toBe("LZ4 (frame)");
  });

  it("describes a payload with the settings needed to reproduce it", async () => {
    const payload = deterministicBytes(4096, 21);
    const legacy = await encodeLz4(payload, { kind: "lz4-legacy", blockMaxSize: 8 * 1024 * 1024 });
    const descriptor = describeCompression(legacy);
    expect(descriptor.format).toBe("lz4-legacy");
    expect(descriptor.lz4?.kind).toBe("lz4-legacy");
    expect(Array.from(await decompressSection(legacy, descriptor))).toEqual(Array.from(payload));
  });

  it("round trips a gzip payload", async () => {
    const payload = deterministicBytes(4096, 17);
    const compressed = await compressGzip(payload);
    expect(detectCompression(compressed)).toBe("gzip");
    expect(Array.from(await decompress(compressed, "gzip"))).toEqual(Array.from(payload));
  });

  it("round trips an xz payload with the module's codec", async () => {
    const raw = deterministicBytes(4096, 7);
    const compressed = await compressSection(raw, { format: "xz" });
    expect(compressed.subarray(0, 6)).toEqual(new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]));
    expect(detectCompression(compressed)).toBe("xz");

    const restored = await decompressSection(compressed, { format: "xz" });
    expect(restored).toEqual(raw);

    // and it reads a stream the reference tool wrote, not only its own
    expect(await decompressSection(compressed, describeCompression(compressed))).toEqual(raw);
  }, 60000);

  it("refuses to expand formats it cannot handle", async () => {
    await expect(decompress(deterministicBytes(32, 5), "zstd")).rejects.toThrowError(/not available/);
  });
});
