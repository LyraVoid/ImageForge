import { PackageError } from "../errors";
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

export interface BmpInfo {
  sizeBytes: number;
  pixelOffset: number;
  headerSize: number;
  width: number;
  height: number;
  bitsPerPixel: number;
  compression: number;
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
  if (typeof DecompressionStream === "undefined") {
    throw new PackageError(
      "DecompressionStream is unavailable in this environment.",
      "This browser cannot expand the frames of a splash image.",
    );
  }
  const stream = new Blob([compressed as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const bmp = new Uint8Array(await new Response(stream).arrayBuffer());
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

/** The fields of a BMP frame, which is where its real resolution comes from. */
export function readBmpInfo(bmp: Uint8Array): BmpInfo {
  if (bmp.length < 54 || bmp[0] !== 0x42 || bmp[1] !== 0x4d) {
    throw new PackageError(
      "A frame does not start with the BMP signature (got " +
        [...bmp.subarray(0, 2)].map((byte) => byte.toString(16)).join(" ") +
        ").",
      "A frame of this splash image is not a BMP.",
    );
  }
  return {
    sizeBytes: readU32(bmp, 2),
    pixelOffset: readU32(bmp, 10),
    headerSize: readU32(bmp, 14),
    width: readU32(bmp, 18),
    height: readU32(bmp, 22),
    bitsPerPixel: bmp[28] | (bmp[29] << 8),
    compression: readU32(bmp, 30),
  };
}
