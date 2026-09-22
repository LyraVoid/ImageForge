import { LZ4_HC_MAX_LEVEL, loadLz4Codec } from "@/wasm/lz4-codec";
import { loadWasmModule } from "@/wasm/loader";
import type { WasmImageModule } from "@/wasm/abi";

export const LZ4_FRAME_MAGIC = 0x184d2204;
export const LZ4_LEGACY_MAGIC = 0x184c2102;

const BLOCK_MAX_SIZES: Record<number, number> = {
  4: 64 * 1024,
  5: 256 * 1024,
  6: 1024 * 1024,
  7: 4 * 1024 * 1024,
};

const LEGACY_BLOCK_MAX_SIZE = 8 * 1024 * 1024;

const PRIME1 = 0x9e3779b1;
const PRIME2 = 0x85ebca77;
const PRIME3 = 0xc2b2ae3d;
const PRIME4 = 0x27d4eb2f;
const PRIME5 = 0x165667b1;

export interface Lz4FrameSettings {
  kind: "lz4-frame";
  version: number;
  blockIndependent: boolean;
  blockChecksum: boolean;
  contentSize: number | null;
  contentChecksum: boolean;
  dictId: number | null;
  blockMaxSizeId: number;
  blockMaxSize: number;
}

export interface Lz4LegacySettings {
  kind: "lz4-legacy";
  blockMaxSize: number;
}

export type Lz4Settings = Lz4FrameSettings | Lz4LegacySettings;

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function readU32(data: Uint8Array, index: number): number {
  return (data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24)) >>> 0;
}

function readU64(data: Uint8Array, index: number): number {
  return readU32(data, index) + readU32(data, index + 4) * 0x100000000;
}

function writeU32(data: Uint8Array, index: number, value: number): void {
  data[index] = value & 0xff;
  data[index + 1] = (value >>> 8) & 0xff;
  data[index + 2] = (value >>> 16) & 0xff;
  data[index + 3] = (value >>> 24) & 0xff;
}

function round(accumulator: number, input: number): number {
  return Math.imul(rotl((accumulator + Math.imul(input, PRIME2)) >>> 0, 13), PRIME1) >>> 0;
}

/** XXH32, required for the LZ4 frame header checksum and the optional block and content checksums. */
export function xxh32(data: Uint8Array, seed = 0): number {
  const length = data.length;
  let index = 0;
  let hash: number;

  if (length >= 16) {
    let v1 = (seed + PRIME1 + PRIME2) >>> 0;
    let v2 = (seed + PRIME2) >>> 0;
    let v3 = seed >>> 0;
    let v4 = (seed - PRIME1) >>> 0;
    const limit = length - 16;
    for (; index <= limit; index += 16) {
      v1 = round(v1, readU32(data, index));
      v2 = round(v2, readU32(data, index + 4));
      v3 = round(v3, readU32(data, index + 8));
      v4 = round(v4, readU32(data, index + 12));
    }
    hash = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0;
  } else {
    hash = (seed + PRIME5) >>> 0;
  }

  hash = (hash + length) >>> 0;
  for (; index + 4 <= length; index += 4) {
    hash = Math.imul(rotl((hash + Math.imul(readU32(data, index), PRIME3)) >>> 0, 17), PRIME4) >>> 0;
  }
  for (; index < length; index += 1) {
    hash = Math.imul(rotl((hash + Math.imul(data[index], PRIME5)) >>> 0, 11), PRIME1) >>> 0;
  }

  hash = (hash ^ (hash >>> 15)) >>> 0;
  hash = Math.imul(hash, PRIME2) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  hash = Math.imul(hash, PRIME3) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function parseLz4Settings(bytes: Uint8Array): Lz4Settings {
  if (bytes.length < 8) throw new Error("LZ4 payload is too short to hold a header.");
  const magic = readU32(bytes, 0);

  if (magic === LZ4_LEGACY_MAGIC) {
    return { kind: "lz4-legacy", blockMaxSize: LEGACY_BLOCK_MAX_SIZE };
  }
  if (magic !== LZ4_FRAME_MAGIC) throw new Error("Not an LZ4 frame.");

  const flg = bytes[4];
  const bd = bytes[5];
  const version = (flg >> 6) & 0x03;
  if (version !== 1) throw new Error("Unsupported LZ4 frame version " + version + ".");
  const blockMaxSizeId = (bd >> 4) & 0x07;
  const blockMaxSize = BLOCK_MAX_SIZES[blockMaxSizeId];
  if (blockMaxSize === undefined) throw new Error("Unsupported LZ4 frame block size id " + blockMaxSizeId + ".");

  const hasContentSize = ((flg >> 3) & 1) === 1;
  const hasDictId = (flg & 1) === 1;
  let cursor = 6;
  let contentSize: number | null = null;
  let dictId: number | null = null;
  if (hasContentSize) {
    contentSize = readU64(bytes, cursor);
    cursor += 8;
  }
  if (hasDictId) {
    dictId = readU32(bytes, cursor);
    cursor += 4;
  }
  if (cursor >= bytes.length) throw new Error("Truncated LZ4 frame header.");
  const expected = (xxh32(bytes.subarray(4, cursor)) >>> 8) & 0xff;
  if (bytes[cursor] !== expected) throw new Error("LZ4 frame header checksum mismatch.");

  return {
    kind: "lz4-frame",
    version,
    blockIndependent: ((flg >> 5) & 1) === 1,
    blockChecksum: ((flg >> 4) & 1) === 1,
    contentSize,
    contentChecksum: ((flg >> 2) & 1) === 1,
    dictId,
    blockMaxSizeId,
    blockMaxSize,
  };
}

export async function decodeLz4(bytes: Uint8Array, settings?: Lz4Settings): Promise<Uint8Array> {
  const resolved = settings ?? parseLz4Settings(bytes);
  const wasm = await loadWasmModule();
  return resolved.kind === "lz4-legacy"
    ? decodeLegacy(bytes, resolved, wasm)
    : decodeFrame(bytes, resolved, wasm);
}

function headerLength(settings: Lz4FrameSettings): number {
  return 6 + (settings.contentSize !== null ? 8 : 0) + (settings.dictId !== null ? 4 : 0) + 1;
}

function decodeLegacy(bytes: Uint8Array, settings: Lz4LegacySettings, wasm: WasmImageModule): Uint8Array {
  const blocks: Uint8Array[] = [];
  let cursor = 4;
  while (cursor + 4 <= bytes.length) {
    const blockSize = readU32(bytes, cursor);
    cursor += 4;
    if (blockSize === 0) break;
    if (cursor + blockSize > bytes.length) throw new Error("Truncated LZ4 legacy block.");
    blocks.push(wasm.lz4DecompressBlock(bytes.subarray(cursor, cursor + blockSize), settings.blockMaxSize));
    cursor += blockSize;
  }
  return concat(blocks);
}

const WINDOW_SIZE = 64 * 1024;

function decodeFrame(bytes: Uint8Array, settings: Lz4FrameSettings, wasm: WasmImageModule): Uint8Array {
  let cursor = headerLength(settings);
  let decoded: Uint8Array = new Uint8Array(0);
  let contentChecksum = 0;
  let ended = false;

  while (cursor + 4 <= bytes.length) {
    const rawBlockSize = readU32(bytes, cursor);
    cursor += 4;
    if (rawBlockSize === 0) {
      ended = true;
      if (settings.contentChecksum && cursor + 4 <= bytes.length) {
        contentChecksum = readU32(bytes, cursor);
      }
      break;
    }

    const uncompressed = (rawBlockSize & 0x80000000) !== 0;
    const blockSize = rawBlockSize & 0x7fffffff;
    if (cursor + blockSize > bytes.length) throw new Error("Truncated LZ4 frame block.");
    const payload = bytes.subarray(cursor, cursor + blockSize);
    cursor += blockSize;

    const prefix = settings.blockIndependent
      ? undefined
      : decoded.length > WINDOW_SIZE
        ? decoded.subarray(decoded.length - WINDOW_SIZE)
        : decoded;
    const block = uncompressed ? payload.slice() : wasm.lz4DecompressBlock(payload, settings.blockMaxSize, prefix);
    if (settings.blockChecksum) {
      if (cursor + 4 > bytes.length) throw new Error("Truncated LZ4 block checksum.");
      const expected = readU32(bytes, cursor);
      cursor += 4;
      if (xxh32(block) !== expected) throw new Error("LZ4 block checksum mismatch.");
    }
    decoded = concat([decoded, block]);
  }

  if (!ended) throw new Error("LZ4 frame has no end mark.");
  const content = decoded;
  if (settings.contentChecksum && xxh32(content) !== contentChecksum) {
    throw new Error("LZ4 content checksum mismatch.");
  }
  if (settings.contentSize !== null && settings.contentSize !== content.length) {
    throw new Error("LZ4 frame records " + settings.contentSize + " bytes but decoded " + content.length + ".");
  }
  return content;
}

/**
 * The reference liblz4 codec when it can be loaded, and our own encoder otherwise. The two produce
 * different (both valid) block bytes: liblz4 matches the official patchers byte for byte, the
 * fallback is a few percent larger.
 */
async function pickBlockCompressor(): Promise<(block: Uint8Array) => Uint8Array> {
  const codec = await loadLz4Codec();
  if (codec) return (block) => codec.compressBlockHC(block, LZ4_HC_MAX_LEVEL);
  const wasm = await loadWasmModule();
  return (block) => wasm.lz4CompressBlock(block);
}

export async function encodeLz4(raw: Uint8Array, settings: Lz4Settings): Promise<Uint8Array> {
  const compress = await pickBlockCompressor();
  return settings.kind === "lz4-legacy"
    ? encodeLegacy(raw, settings, compress)
    : encodeFrame(raw, settings, compress);
}

function compressBlocks(
  raw: Uint8Array,
  blockMaxSize: number,
  compress: (block: Uint8Array) => Uint8Array,
): Uint8Array[] {
  if (raw.length === 0) return [];
  const blocks: Uint8Array[] = [];
  for (let offset = 0; offset < raw.length; offset += blockMaxSize) {
    blocks.push(compress(raw.subarray(offset, Math.min(offset + blockMaxSize, raw.length))));
  }
  return blocks;
}

function encodeLegacy(
  raw: Uint8Array,
  settings: Lz4LegacySettings,
  compress: (block: Uint8Array) => Uint8Array,
): Uint8Array {
  const blocks = compressBlocks(raw, settings.blockMaxSize, compress);
  // The legacy stream is only the magic followed by [size][block] pairs: the reference tool and the
  // images devices ship agree on that, and a reader simply consumes the whole input. Some patchers
  // (magiskboot) append the uncompressed size as well; a decoder can do without it, so it is not
  // written here.
  let size = 4;
  for (const block of blocks) size += 4 + block.length;
  const out = new Uint8Array(size);
  writeU32(out, 0, LZ4_LEGACY_MAGIC);
  let cursor = 4;
  for (const block of blocks) {
    writeU32(out, cursor, block.length);
    cursor += 4;
    out.set(block, cursor);
    cursor += block.length;
  }
  return out;
}

function encodeFrame(
  raw: Uint8Array,
  settings: Lz4FrameSettings,
  compress: (block: Uint8Array) => Uint8Array,
): Uint8Array {
  const blocks = compressBlocks(raw, settings.blockMaxSize, compress);
  const header = headerLength(settings);

  // Materialise every block first so the allocation is exact: trailing bytes would
  // be read as another frame by strict decoders.
  const entries: Array<{ payload: Uint8Array; rawLength: number; uncompressed: boolean }> = [];
  let offset = 0;
  for (const block of blocks) {
    const rawLength = Math.min(settings.blockMaxSize, raw.length - offset);
    if (rawLength <= 0) break;
    const uncompressed = block.length >= rawLength;
    entries.push({
      payload: uncompressed ? raw.subarray(offset, offset + rawLength) : block,
      rawLength,
      uncompressed,
    });
    offset += rawLength;
  }

  let size = header + 4;
  for (const entry of entries) size += 4 + entry.payload.length + (settings.blockChecksum ? 4 : 0);
  if (settings.contentChecksum) size += 4;

  const out = new Uint8Array(size);
  writeU32(out, 0, LZ4_FRAME_MAGIC);
  let flg = 1 << 6;
  if (settings.blockIndependent) flg |= 1 << 5;
  if (settings.blockChecksum) flg |= 1 << 4;
  if (settings.contentSize !== null) flg |= 1 << 3;
  if (settings.contentChecksum) flg |= 1 << 2;
  if (settings.dictId !== null) flg |= 1;
  out[4] = flg;
  out[5] = (settings.blockMaxSizeId & 0x07) << 4;

  let cursor = 6;
  if (settings.contentSize !== null) {
    writeU32(out, cursor, raw.length >>> 0);
    writeU32(out, cursor + 4, Math.floor(raw.length / 0x100000000) >>> 0);
    cursor += 8;
  }
  if (settings.dictId !== null) {
    writeU32(out, cursor, settings.dictId >>> 0);
    cursor += 4;
  }
  out[cursor] = (xxh32(out.subarray(4, cursor)) >>> 8) & 0xff;
  cursor += 1;

  let rawOffset = 0;
  for (const entry of entries) {
    if (entry.uncompressed) {
      writeU32(out, cursor, (entry.rawLength | 0x80000000) >>> 0);
      cursor += 4;
      out.set(entry.payload, cursor);
      cursor += entry.payload.length;
    } else {
      writeU32(out, cursor, entry.payload.length);
      cursor += 4;
      out.set(entry.payload, cursor);
      cursor += entry.payload.length;
    }
    if (settings.blockChecksum) {
      writeU32(out, cursor, xxh32(raw.subarray(rawOffset, rawOffset + entry.rawLength)));
      cursor += 4;
    }
    rawOffset += entry.rawLength;
  }

  writeU32(out, cursor, 0);
  cursor += 4;
  if (settings.contentChecksum) {
    writeU32(out, cursor, xxh32(raw));
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
