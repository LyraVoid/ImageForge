import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLz4, encodeLz4, parseLz4Settings, xxh32 } from "@/core/image/lz4";
import type { Lz4FrameSettings } from "@/core/image/lz4";
import { describeCompression, detectCompression, decompressSection } from "@/core/image";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { lz4CompressBlock as fallbackCompress, lz4DecompressBlock as fallbackDecompress } from "@/wasm/fallback";
import { loadWasmModule } from "@/wasm/loader";
import { LZ4_HC_MAX_LEVEL, LZ4_REFERENCE_VERSION, loadLz4Codec, resetLz4Codec } from "@/wasm/lz4-codec";
import { decodeRamdisk, encodeRamdisk } from "@/core/image";
import { repoPath } from "../fixtures/artifacts";

const LZ4_BIN = ["/usr/bin/lz4", "/usr/local/bin/lz4"].find((path) => existsSync(path)) ?? null;
const FRAME_HEADER_HINT = "lz4 frame";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state >>> 16) & 0xff;
  };
}

function semiRepetitive(size: number, blockSize = 64 * 1024, seed = 7): Uint8Array {
  const next = lcg(seed);
  const block = new Uint8Array(blockSize);
  for (let i = 0; i < block.length; i += 1) block[i] = next();
  const out = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += blockSize) {
    out.set(block.subarray(0, Math.min(blockSize, size - offset)), offset);
  }
  return out;
}

function random(size: number, seed = 11): Uint8Array {
  const next = lcg(seed);
  const out = new Uint8Array(size);
  for (let i = 0; i < out.length; i += 1) out[i] = next();
  return out;
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

const workDir = mkdtempSync(join(tmpdir(), "imageforge-lz4-"));

/** The real ramdisk the container question is decided on: a device init_boot image. */
const INIT_BOOT_PATH = process.env.IMAGEFORGE_INIT_BOOT ?? repoPath(".research", "aster-validation", "init_boot.img");
const hasInitBoot = existsSync(INIT_BOOT_PATH);

function runLz4(args: string[]): void {
  execFileSync(LZ4_BIN as string, args, { stdio: "pipe" });
}

describe("lz4 primitives", () => {
  it("computes the published XXH32 vector", () => {
    expect(xxh32(new Uint8Array(0))).toBe(0x02cc5d05);
  });

  it("produces identical bytes in WebAssembly and in the TypeScript fallback", async () => {
    const wasm = await loadWasmModule();
    const samples = [semiRepetitive(70_000), random(50_000), new Uint8Array(0), new Uint8Array([1, 2, 3, 4, 5])];

    for (const sample of samples) {
      const fromWasm = wasm.lz4CompressBlock(sample);
      const fromFallback = fallbackCompress(sample);
      expect(same(fromWasm, fromFallback)).toBe(true);
      expect(same(fallbackDecompress(fromWasm, Math.max(1, sample.length)), sample)).toBe(true);
    }
  });

  it("round trips both containers through its own encoder and decoder", async () => {
    const payload = semiRepetitive(300_000);

    const legacy = await encodeLz4(payload, { kind: "lz4-legacy", blockMaxSize: 8 * 1024 * 1024 });
    expect(detectCompression(legacy)).toBe("lz4-legacy");
    expect(same(await decodeLz4(legacy), payload)).toBe(true);

    const frames: Lz4FrameSettings[] = [
      {
        kind: "lz4-frame",
        version: 1,
        blockIndependent: true,
        blockChecksum: false,
        contentSize: null,
        contentChecksum: false,
        dictId: null,
        blockMaxSizeId: 4,
        blockMaxSize: 64 * 1024,
      },
      {
        kind: "lz4-frame",
        version: 1,
        blockIndependent: false,
        blockChecksum: true,
        contentSize: payload.length,
        contentChecksum: true,
        dictId: null,
        blockMaxSizeId: 6,
        blockMaxSize: 1024 * 1024,
      },
    ];

    for (const settings of frames) {
      const encoded = await encodeLz4(payload, settings);
      expect(detectCompression(encoded)).toBe("lz4-frame");
      const parsed = parseLz4Settings(encoded);
      expect(parsed.kind).toBe("lz4-frame");
      if (parsed.kind === "lz4-frame") {
        expect(parsed.blockIndependent).toBe(settings.blockIndependent);
        expect(parsed.blockChecksum).toBe(settings.blockChecksum);
        expect(parsed.contentChecksum).toBe(settings.contentChecksum);
        expect(parsed.contentSize).toBe(settings.contentSize);
        expect(parsed.blockMaxSizeId).toBe(settings.blockMaxSizeId);
      }
      expect(same(await decodeLz4(encoded), payload)).toBe(true);
      const descriptor = describeCompression(encoded);
      expect(same(await decompressSection(encoded, descriptor), payload)).toBe(true);
    }
  });

  it("rejects a corrupted frame header checksum", async () => {
    const encoded = await encodeLz4(semiRepetitive(20_000), {
      kind: "lz4-frame",
      version: 1,
      blockIndependent: true,
      blockChecksum: false,
      contentSize: null,
      contentChecksum: false,
      dictId: null,
      blockMaxSizeId: 7,
      blockMaxSize: 4 * 1024 * 1024,
    });
    const corrupted = new Uint8Array(encoded);
    corrupted[4] ^= 0x20;
    expect(() => parseLz4Settings(corrupted)).toThrowError(new RegExp(FRAME_HEADER_HINT, "i"));
  });
});

describe.skipIf(!LZ4_BIN)("cross checks against the reference lz4 tool", () => {
  const payload = semiRepetitive(9 * 1024 * 1024);
  const inputPath = join(workDir, "input.bin");
  const framePath = join(workDir, "frame.lz4");
  const legacyPath = join(workDir, "legacy.lz4");
  const linkedPath = join(workDir, "linked.lz4");
  const decodedPath = join(workDir, "decoded.bin");
  const oursPath = join(workDir, "ours.lz4");

  it("decodes frames produced by the reference encoder", async () => {
    writeFileSync(inputPath, payload);
    runLz4(["-f", "-q", inputPath, framePath]);
    const frame = new Uint8Array(readFileSync(framePath));
    expect(detectCompression(frame)).toBe("lz4-frame");
    expect(same(await decodeLz4(frame), payload)).toBe(true);
  });

  it("decodes legacy frames produced by the reference encoder", async () => {
    runLz4(["-l", "-f", "-q", inputPath, legacyPath]);
    const legacy = new Uint8Array(readFileSync(legacyPath));
    expect(detectCompression(legacy)).toBe("lz4-legacy");
    expect(same(await decodeLz4(legacy), payload)).toBe(true);
  });

  it("decodes frames with dependent blocks that match into the previous window", async () => {
    runLz4(["-BD", "-f", "-q", inputPath, linkedPath]);
    const linked = new Uint8Array(readFileSync(linkedPath));
    const settings = parseLz4Settings(linked);
    expect(settings.kind).toBe("lz4-frame");
    if (settings.kind === "lz4-frame") expect(settings.blockIndependent).toBe(false);
    expect(same(await decodeLz4(linked), payload)).toBe(true);
  });

  it("produces frames the reference decoder accepts", async () => {
    const settings = parseLz4Settings(new Uint8Array(readFileSync(framePath)));
    const encoded = await encodeLz4(payload, settings);
    writeFileSync(oursPath, encoded);
    runLz4(["-d", "-f", "-q", oursPath, decodedPath]);
    expect(same(new Uint8Array(readFileSync(decodedPath)), payload)).toBe(true);
  });

  it("produces legacy frames the reference decoder accepts", async () => {
    const settings = parseLz4Settings(new Uint8Array(readFileSync(legacyPath)));
    const encoded = await encodeLz4(payload, settings);
    writeFileSync(oursPath, encoded);
    runLz4(["-d", "-f", "-q", oursPath, decodedPath]);
    expect(same(new Uint8Array(readFileSync(decodedPath)), payload)).toBe(true);
  });
});

describe("the reference liblz4 codec", () => {
  it("reports the pinned upstream version", async () => {
    const codec = await loadLz4Codec();
    expect(codec).not.toBeNull();
    expect(codec?.version).toBe(LZ4_REFERENCE_VERSION);
    expect(LZ4_HC_MAX_LEVEL).toBe(12);
  });

  it("compresses a block that our own decoder reads back", async () => {
    const codec = await loadLz4Codec();
    // The repetition distance has to stay inside LZ4's 64 KiB match window: a block that repeats
    // every 65536 bytes cannot be referenced and expands slightly instead.
    const payload = semiRepetitive(200_000, 32 * 1024);
    const compressed = codec?.compressBlockHC(payload);

    expect(compressed).toBeDefined();
    expect((compressed as Uint8Array).length).toBeLessThan(payload.length);
    expect(same(await decodeLz4(concatLegacy(compressed as Uint8Array)), payload)).toBe(true);
  });

  it("keeps the hand written encoder as the fallback", async () => {
    resetLz4Codec();
    const wasm = await loadWasmModule();
    const payload = semiRepetitive(200_000);
    // the fallback stays available and is what an environment without the reference module gets
    expect(same(fallbackCompress(payload), wasm.lz4CompressBlock(payload))).toBe(true);
  });
});

function concatLegacy(block: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + block.length);
  out[0] = 0x02;
  out[1] = 0x21;
  out[2] = 0x4c;
  out[3] = 0x18;
  out[4] = block.length & 0xff;
  out[5] = (block.length >>> 8) & 0xff;
  out[6] = (block.length >>> 16) & 0xff;
  out[7] = (block.length >>> 24) & 0xff;
  out.set(block, 8);
  return out;
}

describe.skipIf(!LZ4_BIN)("the reference encoder as the oracle", () => {
  it("writes the same legacy container as lz4 -12", async () => {
    const payload = semiRepetitive(600_000);
    const inputPath = join(workDir, "oracle.bin");
    const referencePath = join(workDir, "oracle.lz4");
    writeFileSync(inputPath, payload);
    runLz4(["-12", "-l", "-f", "-q", inputPath, referencePath]);

    const ours = await encodeLz4(payload, { kind: "lz4-legacy", blockMaxSize: 8 * 1024 * 1024 });
    expect(same(ours, new Uint8Array(readFileSync(referencePath)))).toBe(true);
  });
});

describe.skipIf(!hasInitBoot)("the device ramdisk container", () => {
  it("re-encodes to exactly the bytes the stock image shipped", async () => {
    const image = assertBootImage(parseImage(new Uint8Array(readFileSync(INIT_BOOT_PATH))));
    const container = sectionOf(image, "ramdisk")?.data ?? new Uint8Array();
    const decoded = await decodeRamdisk(container);
    const ours = await encodeRamdisk(decoded.archive, decoded.descriptor);

    expect(decoded.payload.length).toBeGreaterThan(1_000_000);
    expect(same(ours, container)).toBe(true);
  }, 300000);
});

