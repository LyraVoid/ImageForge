import { PackageError } from "../errors";
import { readAll } from "../package/source";
import type { ByteSource } from "../package/source";
import { decodeZlib, encodeZlib } from "../image/zlib";

/**
 * MediaTek's logo.img, the container MTK devices keep their boot screen in.
 *
 * Structure, established by this project's own reading of the format against a real Xiaomi image and
 * two independent implementations (see .research/mtk-logo/NOTES.md):
 *
 *   0x0000  512 byte header, kept verbatim (a "logo" magic sits at offset 8)
 *   0x0200  payload: u32 block count, u32 payload end, then one u32 offset per block
 *   ...     each block is a zlib stream of raw pixels
 *
 * The pixels carry no header of their own: the block is w * h * bytes-per-pixel, with a row stride
 * that may be aligned and an optional prefix. Which of those it is has to be inferred from the block's
 * length and the display resolution, which is why the resolution is an input here (the reference tool
 * takes it as a command line argument for the same reason). Blocks whose length does not fit the
 * resolution, typically small icons, come back with no layout and are left alone.
 */
export const MTK_HEADER_SIZE = 0x200;

/** Alignments and prefixes the format is known to use, in the order the reference tries them. */
const ALIGNMENTS = [4, 8, 16, 32, 64, 128, 256];
const PREFIX_BYTES = [0, 4, 8, 12, 16, 32, 64, 128, 256, 512];

export interface MtkLayout {
  bytesPerPixel: number;
  stride: number;
  prefixBytes: number;
  width: number;
  height: number;
}

export interface MtkFrame {
  index: number;
  /** Offset of the compressed block inside the payload. */
  offset: number;
  compressedSize: number;
  /** Length of the block once inflated. */
  rawSize: number;
  /** How the block's pixels are laid out, or null when its length does not fit the resolution. */
  layout: MtkLayout | null;
}

export interface ParsedMtkLogo {
  blockCount: number;
  payloadEnd: number;
  header: Uint8Array;
  frames: MtkFrame[];
  sizeBytes: number;
}

/**
 * The layout a block of this length has at this resolution. Ported from the reference implementation
 * (YetAnotherMediaTekLogoPatcher, utils/binary.py:60), which tries two, three and four byte pixels,
 * each with the row size and every alignment of it, each with every known prefix.
 */
export function detectMtkLayout(rawSize: number, width: number, height: number): MtkLayout | null {
  for (const bytesPerPixel of [2, 3, 4]) {
    const rowSize = width * bytesPerPixel;
    const strides = [rowSize];
    for (const alignment of ALIGNMENTS) {
      const aligned = Math.ceil(rowSize / alignment) * alignment;
      if (!strides.includes(aligned)) strides.push(aligned);
    }
    for (const prefixBytes of PREFIX_BYTES) {
      for (const stride of strides) {
        if (rawSize === prefixBytes + stride * height) {
          return { bytesPerPixel, stride, prefixBytes, width, height };
        }
      }
    }
  }
  return null;
}

/**
 * The resolutions that could explain a block of this length: the length is width * height * bytes per
 * pixel for a phone shaped screen. The format records no resolution, and several of these decode to
 * noise, so the tool offers them and the preview decides — more than the reference tool does with its
 * bare resolution argument.
 */
export function suggestMtkResolutions(
  rawSize: number,
  limit = 8,
): { width: number; height: number; bytesPerPixel: number }[] {
  const out: { width: number; height: number; bytesPerPixel: number; distance: number }[] = [];
  for (const bytesPerPixel of [4, 2, 3]) {
    const pixels = rawSize / bytesPerPixel;
    if (!Number.isInteger(pixels)) continue;
    for (let width = 240; width <= 1600; width += 1) {
      if (pixels % width !== 0) continue;
      const height = pixels / width;
      if (height < 800 || height > 3400) continue;
      const ratio = height / width;
      if (ratio < 1.5 || ratio > 2.6) continue;
      out.push({ width, height, bytesPerPixel, distance: Math.abs(ratio - 2.0) });
    }
  }
  out.sort((left, right) => left.distance - right.distance);
  return out.slice(0, limit).map(({ width, height, bytesPerPixel }) => ({ width, height, bytesPerPixel }));
}

/** Inflates one block. The container stores no raw length, so this is also how a frame is measured. */
export async function readMtkFrameRaw(source: ByteSource, frame: MtkFrame): Promise<Uint8Array> {
  const block = await source.read(MTK_HEADER_SIZE + frame.offset, frame.compressedSize);
  if (block.length !== frame.compressedSize) {
    throw new PackageError(
      "Block " + frame.index + " needs " + frame.compressedSize + " bytes but only " + block.length + " are there.",
      "This logo image is damaged.",
    );
  }
  return decodeZlib(block);
}

export async function parseMtkLogo(
  source: ByteSource,
  resolution: { width: number; height: number },
): Promise<ParsedMtkLogo> {
  if (source.size < MTK_HEADER_SIZE + 8) {
    throw new PackageError(
      "A logo image needs at least " + (MTK_HEADER_SIZE + 8) + " bytes but this is " + source.size + ".",
      "This file is too small to be a logo image.",
    );
  }
  const header = await source.read(0, MTK_HEADER_SIZE);
  const table = await source.read(MTK_HEADER_SIZE, 8);
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const blockCount = view.getUint32(0, true);
  let payloadEnd = view.getUint32(4, true);
  const payloadSize = source.size - MTK_HEADER_SIZE;
  if (blockCount === 0 || blockCount > 4096) {
    throw new PackageError(
      "A logo image with " + blockCount + " blocks is not credible.",
      "This file does not look like a logo image.",
    );
  }
  if (payloadEnd <= 0 || payloadEnd > payloadSize) payloadEnd = payloadSize;

  const offsetsBytes = await source.read(MTK_HEADER_SIZE + 8, blockCount * 4);
  if (offsetsBytes.length < blockCount * 4) {
    throw new PackageError("The block table is truncated.", "This logo image is damaged.");
  }
  const offsetsView = new DataView(offsetsBytes.buffer, offsetsBytes.byteOffset, offsetsBytes.byteLength);
  const offsets: number[] = [];
  for (let index = 0; index < blockCount; index += 1) offsets.push(offsetsView.getUint32(index * 4, true));

  const tableSize = 8 + blockCount * 4;
  const invalid =
    offsets[0] < tableSize ||
    offsets[blockCount - 1] >= payloadEnd ||
    offsets.some((value, index) => index > 0 && value <= offsets[index - 1]);
  if (invalid) {
    throw new PackageError("The block table contains invalid offsets.", "This logo image is damaged.");
  }

  const frames: MtkFrame[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const offset = offsets[index];
    const end = index + 1 < blockCount ? offsets[index + 1] : payloadEnd;
    const frame: MtkFrame = {
      index,
      offset,
      compressedSize: end - offset,
      rawSize: 0,
      layout: null,
    };
    // The raw length is not stored anywhere, so each block is inflated once to measure it.
    frame.rawSize = (await readMtkFrameRaw(source, frame)).length;
    frame.layout = detectMtkLayout(frame.rawSize, resolution.width, resolution.height);
    frames.push(frame);
  }
  return { blockCount, payloadEnd, header, frames, sizeBytes: source.size };
}

/** Reads a block's pixels as straight RGBA, top row first. */
export function decodeMtkPixels(raw: Uint8Array, layout: MtkLayout): Uint8Array {
  const { bytesPerPixel, stride, prefixBytes, width, height } = layout;
  const needed = prefixBytes + stride * height;
  if (raw.length < needed) {
    throw new PackageError(
      "A block of " + raw.length + " bytes does not hold " + width + "x" + height + " at " + bytesPerPixel + " bytes per pixel.",
      "This frame is not the resolution you gave.",
    );
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = prefixBytes + y * stride;
    for (let x = 0; x < width; x += 1) {
      const at = row + x * bytesPerPixel;
      const to = (y * width + x) * 4;
      if (bytesPerPixel === 2) {
        const packed = raw[at] | (raw[at + 1] << 8);
        rgba[to] = ((packed & 31) * 255) / 31;
        rgba[to + 1] = (((packed >> 5) & 63) * 255) / 63;
        rgba[to + 2] = (((packed >> 11) & 31) * 255) / 31;
        rgba[to + 3] = 255;
      } else if (bytesPerPixel === 3) {
        rgba[to] = raw[at + 2];
        rgba[to + 1] = raw[at + 1];
        rgba[to + 2] = raw[at];
        rgba[to + 3] = 255;
      } else {
        rgba[to] = raw[at + 2];
        rgba[to + 1] = raw[at + 1];
        rgba[to + 2] = raw[at];
        rgba[to + 3] = raw[at + 3];
      }
    }
  }
  return rgba;
}

/**
 * Writes RGBA back in a block's layout. The prefix bytes are copied from the block being replaced,
 * because what they hold is not known and inventing them would be worse than keeping them.
 */
export function encodeMtkPixels(
  rgba: Uint8Array,
  layout: MtkLayout,
  prefixBytes: Uint8Array = new Uint8Array(layout.prefixBytes),
): Uint8Array {
  const { bytesPerPixel, stride, width, height } = layout;
  const out = new Uint8Array(layout.prefixBytes + stride * height);
  out.set(prefixBytes.subarray(0, layout.prefixBytes), 0);
  for (let y = 0; y < height; y += 1) {
    const row = layout.prefixBytes + y * stride;
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const at = row + x * bytesPerPixel;
      if (bytesPerPixel === 2) {
        const red = Math.round((rgba[from] * 31) / 255);
        const green = Math.round((rgba[from + 1] * 63) / 255);
        const blue = Math.round((rgba[from + 2] * 31) / 255);
        const packed = (red & 31) | ((green & 63) << 5) | ((blue & 31) << 11);
        out[at] = packed & 0xff;
        out[at + 1] = (packed >> 8) & 0xff;
      } else if (bytesPerPixel === 3) {
        out[at] = rgba[from + 2];
        out[at + 1] = rgba[from + 1];
        out[at + 2] = rgba[from];
      } else {
        out[at] = rgba[from + 2];
        out[at + 1] = rgba[from + 1];
        out[at + 2] = rgba[from];
        out[at + 3] = rgba[from + 3];
      }
    }
  }
  return out;
}

export type MtkPackEntry =
  | { kind: "keep"; frame: MtkFrame }
  | { kind: "replace"; frame: MtkFrame; raw: Uint8Array };

export interface PackedMtkLogo {
  bytes: Uint8Array;
  sizeDelta: number;
  replaced: number;
}

/**
 * Rebuilds a logo image. Blocks that are not replaced are copied byte for byte and the 512 byte
 * header is kept, so rebuilding without changes reproduces the image exactly; the result is padded to
 * the original size (a logo partition has a fixed size, and the vendor tooling does the same).
 */
export async function packMtkLogo(
  source: ByteSource,
  parsed: ParsedMtkLogo,
  entries: MtkPackEntry[],
): Promise<PackedMtkLogo> {
  const blocks: Uint8Array[] = [];
  let replaced = 0;
  for (const entry of entries) {
    if (entry.kind === "keep") {
      blocks.push(await source.read(MTK_HEADER_SIZE + entry.frame.offset, entry.frame.compressedSize));
    } else {
      blocks.push(await encodeZlib(entry.raw));
      replaced += 1;
    }
  }

  const payloadSize = 8 + blocks.length * 4 + blocks.reduce((sum, block) => sum + block.length, 0);
  const totalSize = Math.max(parsed.sizeBytes, MTK_HEADER_SIZE + payloadSize);
  // Start from the image's own bytes: the header, whatever sits after the last block (a real sample
  // has six kilobytes of it) and anything else the format keeps all have to survive a rebuild. Only
  // the table and the block payload are written below, which is what makes an unchanged rebuild come
  // back byte for byte.
  const stock = await readAll(source);
  const out = new Uint8Array(totalSize);
  out.set(stock.subarray(0, Math.min(stock.length, totalSize)), 0);
  const view = new DataView(out.buffer, out.byteOffset);
  view.setUint32(MTK_HEADER_SIZE, blocks.length, true);
  let cursor = 8 + blocks.length * 4;
  blocks.forEach((block, index) => {
    view.setUint32(MTK_HEADER_SIZE + 8 + index * 4, cursor, true);
    out.set(block, MTK_HEADER_SIZE + cursor);
    cursor += block.length;
  });
  view.setUint32(MTK_HEADER_SIZE + 4, cursor, true);
  return { bytes: out, sizeDelta: totalSize - source.size, replaced };
}
