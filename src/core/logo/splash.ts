import { PackageError } from "../errors";
import { readAll } from "../package/source";
import type { ByteSource } from "../package/source";

/**
 * The OPPO / Realme / OnePlus `splash.img` format (Qualcomm devices), read from the real partition of
 * a CPH2723 and from this project's own FolkSplash tool (same author, same licence; a copy of its
 * Dart sources is kept in `.research/folksplash/` for reference while this port is written).
 *
 * Layout, offsets in bytes:
 *
 *     0x0000  optional DDPH block: magic 0x48504444 and a flag, little endian
 *     0x4000  "SPLASH LOGO!" (12 bytes)
 *     0x400C  three 0x40 byte blocks the format keeps verbatim (a repack must copy them back)
 *     0x40CC  0x40 zero bytes
 *     0x410C  imgnumber, unknow, width, height, special (five little endian u32)
 *     0x4120  one 0x80 byte entry per frame: data offset, real size, compressed size, name[0x74]
 *     0x8000  the frames, back to back: each one a gzip stream whose payload is a BMP
 *
 * The two sizes matter: a frame is stored gzipped, and the bootloader shows the decompressed BMP.
 */
export const SPLASH_MAGIC = "SPLASH LOGO!";
export const SPLASH_MAGIC_OFFSET = 0x4000;
export const SPLASH_DATA_OFFSET = 0x8000;
export const SPLASH_METADATA_SIZE = 0x80;
export const SPLASH_NAME_SIZE = 0x74;
export const SPLASH_RESERVED_BLOCKS = 3;
export const SPLASH_RESERVED_BLOCK_SIZE = 0x40;
/** The header block: imgnumber, unknow, width, height, special. */
export const SPLASH_HEADER_INFO_OFFSET = SPLASH_MAGIC_OFFSET + 12 + SPLASH_RESERVED_BLOCKS * SPLASH_RESERVED_BLOCK_SIZE + SPLASH_RESERVED_BLOCK_SIZE;
export const SPLASH_METADATA_OFFSET = SPLASH_HEADER_INFO_OFFSET + 20;
export const DDPH_MAGIC = 0x48504444;

export interface SplashFrame {
  index: number;
  name: string;
  /** Offset inside the data area, that is after {@link SPLASH_DATA_OFFSET}. */
  offset: number;
  /** Size of the decompressed BMP. */
  realSize: number;
  /** Size of the gzip stream that holds it. */
  compressedSize: number;
}

export interface ParsedSplash {
  hasDdph: boolean;
  ddphFlag: number;
  imgnumber: number;
  unknow: number;
  /** The device's screen size, which is also what a frame should be resized to. */
  width: number;
  height: number;
  special: number;
  /** The three 0x40 byte blocks, kept so a repack can write them back unchanged. */
  reservedBlocks: Uint8Array[];
  frames: SplashFrame[];
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  const end = bytes.indexOf(0, offset);
  const stop = end < 0 || end > offset + length ? offset + length : end;
  return new TextDecoder().decode(bytes.subarray(offset, stop));
}

export async function parseSplash(source: ByteSource): Promise<ParsedSplash> {
  if (source.size < SPLASH_DATA_OFFSET) {
    throw new PackageError(
      "A splash image is at least " + SPLASH_DATA_OFFSET + " bytes; this file is " + source.size + ".",
      "This file is too short to be a splash image.",
    );
  }
  const magic = readString(await source.read(SPLASH_MAGIC_OFFSET, 12), 0, 12);
  if (magic !== SPLASH_MAGIC) {
    throw new PackageError(
      'The magic at 0x4000 is "' + magic + '", not "' + SPLASH_MAGIC + '".',
      "This is not an OPPO/Realme/OnePlus splash image.",
    );
  }

  const ddphBytes = await source.read(0, 8);
  const hasDdph = readU32(ddphBytes, 0) === DDPH_MAGIC;

  const reservedBlocks: Uint8Array[] = [];
  for (let index = 0; index < SPLASH_RESERVED_BLOCKS; index += 1) {
    reservedBlocks.push(
      await source.read(SPLASH_MAGIC_OFFSET + 12 + index * SPLASH_RESERVED_BLOCK_SIZE, SPLASH_RESERVED_BLOCK_SIZE),
    );
  }

  const headerInfo = await source.read(SPLASH_HEADER_INFO_OFFSET, 20);
  const imgnumber = readU32(headerInfo, 0);
  if (imgnumber === 0 || imgnumber > 64) {
    throw new PackageError(
      "The header declares " + imgnumber + " frames.",
      "This splash image is damaged.",
    );
  }

  const frames: SplashFrame[] = [];
  for (let index = 0; index < imgnumber; index += 1) {
    const at = SPLASH_METADATA_OFFSET + index * SPLASH_METADATA_SIZE;
    const entry = await source.read(at, SPLASH_METADATA_SIZE);
    frames.push({
      index,
      name: readString(entry, 12, SPLASH_NAME_SIZE),
      offset: readU32(entry, 0),
      realSize: readU32(entry, 4),
      compressedSize: readU32(entry, 8),
    });
  }

  return {
    hasDdph,
    ddphFlag: hasDdph ? readU32(ddphBytes, 4) : 0,
    imgnumber,
    unknow: readU32(headerInfo, 4),
    width: readU32(headerInfo, 8),
    height: readU32(headerInfo, 12),
    special: readU32(headerInfo, 16),
    reservedBlocks,
    frames,
  };
}

/** One frame of a repack: either the stored stream, or a new BMP to compress in. */
export type SplashPackEntry =
  | { kind: "keep"; frame: SplashFrame }
  | { kind: "replace"; index: number; bmp: Uint8Array; name?: string };

export interface PackedSplash {
  bytes: Uint8Array;
  /** How much larger the result is than the image it was built from (negative when it shrank). */
  sizeDelta: number;
  /** Frames whose streams were compressed again. */
  replaced: number;
}

/**
 * Builds a splash image.
 *
 * Everything the format does not require to change is copied from the image that was read: the DDPH
 * block and the header blocks, the metadata entries (each one is patched in place, so a frame's name
 * bytes stay exactly as they were) and, above all, the stored gzip stream of every frame that is not
 * being replaced. Repacking an unmodified image therefore reproduces it byte for byte — the invariant
 * the rest of this project holds its containers to. The result keeps the original file size unless
 * the new frames need more room, which is what the vendor's own tooling does.
 */
export async function packSplash(
  source: ByteSource,
  parsed: ParsedSplash,
  entries: SplashPackEntry[],
  options: { originalSize?: number } = {},
): Promise<PackedSplash> {
  const { encodeGzip } = await import("../image/gzip");
  const encoder = new TextEncoder();

  const streams: Uint8Array[] = [];
  const realSizes: number[] = [];
  const names: (Uint8Array | null)[] = [];
  let replaced = 0;

  for (const entry of entries) {
    if (entry.kind === "keep") {
      streams.push(await readSplashFrameCompressed(source, entry.frame));
      realSizes.push(entry.frame.realSize);
      names.push(null);
    } else {
      streams.push(await encodeGzip(entry.bmp));
      realSizes.push(entry.bmp.length);
      names.push(entry.name === undefined ? null : encoder.encode(entry.name));
      replaced += 1;
    }
  }

  const originalSize = options.originalSize ?? source.size;
  const dataSize = streams.reduce((sum, stream) => sum + stream.length, 0);
  const needed = SPLASH_DATA_OFFSET + dataSize;
  const totalSize = Math.max(originalSize, needed);

  // Start from the image as it is: the DDPH block, the magic, the three reserved blocks, the header
  // info, the metadata area, whatever sits between it and the data area, and everything after the
  // frames all come from the source. Only the entries and the frame streams are written below, which
  // is what makes a repack of an unmodified image come back byte for byte.
  const stock = await readAll(source);
  const out = new Uint8Array(totalSize);
  out.set(stock.subarray(0, Math.min(stock.length, totalSize)), 0);
  if (entries.length !== parsed.imgnumber) {
    writeU32(out, SPLASH_HEADER_INFO_OFFSET, entries.length);
    // Entries the new image no longer has must not point into the data area any more.
    for (let index = entries.length; index < parsed.imgnumber; index += 1) {
      out.fill(0, SPLASH_METADATA_OFFSET + index * SPLASH_METADATA_SIZE, SPLASH_METADATA_OFFSET + (index + 1) * SPLASH_METADATA_SIZE);
    }
  }

  let offset = 0;
  for (let index = 0; index < streams.length; index += 1) {
    const at = SPLASH_METADATA_OFFSET + index * SPLASH_METADATA_SIZE;
    writeU32(out, at, offset);
    writeU32(out, at + 4, realSizes[index]);
    writeU32(out, at + 8, streams[index].length);
    if (names[index] !== null) {
      out.fill(0, at + 12, at + SPLASH_METADATA_SIZE);
      out.set((names[index] as Uint8Array).subarray(0, SPLASH_NAME_SIZE), at + 12);
    }
    out.set(streams[index], SPLASH_DATA_OFFSET + offset);
    offset += streams[index].length;
  }

  return { bytes: out, sizeDelta: totalSize - source.size, replaced };
}

function writeU32(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 4).setUint32(0, value >>> 0, true);
}

/** The gzip stream of one frame, exactly as it is stored. */
export async function readSplashFrameCompressed(
  source: ByteSource,
  frame: SplashFrame,
): Promise<Uint8Array> {
  return source.read(SPLASH_DATA_OFFSET + frame.offset, frame.compressedSize);
}

/** Expands the gzip stream of a frame into the BMP the bootloader displays. */
export async function readSplashFrameBmp(source: ByteSource, frame: SplashFrame): Promise<Uint8Array> {
  const compressed = await readSplashFrameCompressed(source, frame);
  if (compressed.length !== frame.compressedSize) {
    throw new PackageError(
      "Frame " + frame.index + " (" + frame.name + ") runs past the end of the image.",
      "This splash image is truncated.",
    );
  }
  const { decodeGzip } = await import("../image/gzip");
  const bmp = await decodeGzip(compressed);
  if (frame.realSize !== 0 && bmp.length !== frame.realSize) {
    throw new PackageError(
      "Frame " +
        frame.index +
        " expands to " +
        bmp.length +
        " bytes but the header says " +
        frame.realSize +
        ".",
      "This splash image is damaged.",
    );
  }
  return bmp;
}
