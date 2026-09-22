import { PackageError } from "../errors";

/**
 * The BMP dialect splash frames use, and the two operations the editor needs on top of it: decoding
 * a frame to RGBA and writing RGBA back out.
 *
 * The layout is the one this project's FolkSplash tool writes (same author, same licence): a 14 byte
 * file header and a 40 byte DIB header (both resolution fields zero), 24 bit BGR pixels, rows from
 * the bottom up, each row padded to a four byte boundary. Splash frames measured on a CPH2723 are all
 * exactly this.
 */
export interface BmpInfo {
  sizeBytes: number;
  pixelOffset: number;
  headerSize: number;
  width: number;
  height: number;
  bitsPerPixel: number;
  compression: number;
  /** The resolution the file declares, in pixels per metre. Real frames use 2835 (72 dpi) or 0. */
  pixelsPerMeter: number;
}

export interface DecodedBmp {
  width: number;
  height: number;
  /** Straight RGBA, row by row from the top. */
  rgba: Uint8Array;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

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
    // A negative height means the rows are stored top down, which no splash frame uses.
    height: new DataView(bmp.buffer, bmp.byteOffset + 22, 4).getInt32(0, true),
    bitsPerPixel: bmp[28] | (bmp[29] << 8),
    compression: readU32(bmp, 30),
    pixelsPerMeter: new DataView(bmp.buffer, bmp.byteOffset + 38, 4).getInt32(0, true),
  };
}

export function decodeBmp(bmp: Uint8Array): DecodedBmp {
  const info = readBmpInfo(bmp);
  if (info.height <= 0) {
    throw new PackageError(
      "The frame is " + info.width + "x" + info.height + ".",
      "This frame stores its rows top down, which this build does not read.",
    );
  }
  if (info.bitsPerPixel !== 24 && info.bitsPerPixel !== 32) {
    throw new PackageError(
      "The frame uses " + info.bitsPerPixel + " bit pixels.",
      "This frame is not a 24 or 32 bit uncompressed BMP.",
    );
  }
  if (info.compression !== 0) {
    throw new PackageError(
      "The frame uses BMP compression " + info.compression + ".",
      "This frame is compressed, which this build does not read.",
    );
  }

  const channels = info.bitsPerPixel / 8;
  const rowSize = Math.ceil((info.width * channels) / 4) * 4;
  const needed = info.pixelOffset + rowSize * info.height;
  if (bmp.length < needed) {
    throw new PackageError(
      "The frame needs " + needed + " bytes but is " + bmp.length + ".",
      "This frame is truncated.",
    );
  }

  const rgba = new Uint8Array(info.width * info.height * 4);
  for (let y = 0; y < info.height; y += 1) {
    const row = info.pixelOffset + (info.height - y - 1) * rowSize;
    for (let x = 0; x < info.width; x += 1) {
      const from = row + x * channels;
      const to = (y * info.width + x) * 4;
      rgba[to] = bmp[from + 2];
      rgba[to + 1] = bmp[from + 1];
      rgba[to + 2] = bmp[from];
      rgba[to + 3] = channels === 4 ? bmp[from + 3] : 255;
    }
  }
  return { width: info.width, height: info.height, rgba };
}

/**
 * Writes RGBA as the 24 bit BMP a splash frame is made of.
 *
 * Two header details are not computed from the pixels, because real frames disagree about them:
 * `pixelsPerMeter` (frames carry 2834, 2835 or 0) and `trailingBytes` (some vendor frames end with a
 * few bytes past the pixel data, and their size field counts them). A caller that replaces a frame
 * passes what the original declared, which is what makes re-encoding a frame reproduce it exactly.
 */
export function encodeBmp(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: { pixelsPerMeter?: number; trailingBytes?: number } = {},
): Uint8Array {
  if (width <= 0 || height <= 0) {
    throw new PackageError("A frame of " + width + "x" + height + " has no pixels.", "This image is empty.");
  }
  if (rgba.length < width * height * 4) {
    throw new PackageError(
      "The pixel buffer holds " + rgba.length + " bytes for " + width + "x" + height + ".",
      "This image is incomplete.",
    );
  }
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const trailingBytes = Math.max(0, options.trailingBytes ?? 0);
  const out = new Uint8Array(54 + pixelDataSize + trailingBytes);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0x4d42, true);
  view.setUint32(2, out.length, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setUint32(18, width, true);
  view.setUint32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  // The vendor's writer counts the trailing bytes as part of the image, so this field is the file
  // length minus the header rather than the pixel data alone.
  view.setUint32(34, out.length - 54, true);
  const pixelsPerMeter = options.pixelsPerMeter ?? 2835;
  view.setInt32(38, pixelsPerMeter, true);
  view.setInt32(42, pixelsPerMeter, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  for (let y = height - 1; y >= 0; y -= 1) {
    let at = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      out[at] = rgba[from + 2];
      out[at + 1] = rgba[from + 1];
      out[at + 2] = rgba[from];
      at += 3;
    }
  }
  return out;
}

export type SplashFit = "cover" | "contain" | "stretch";

export interface FittedImage {
  rgba: Uint8Array;
  width: number;
  height: number;
}

function sampleBilinear(
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  x: number,
  y: number,
  out: Uint8Array,
  at: number,
): void {
  const fx = Math.min(Math.max(x, 0), srcWidth - 1);
  const fy = Math.min(Math.max(y, 0), srcHeight - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, srcWidth - 1);
  const y1 = Math.min(y0 + 1, srcHeight - 1);
  const wx = fx - x0;
  const wy = fy - y0;
  const p00 = (y0 * srcWidth + x0) * 4;
  const p10 = (y0 * srcWidth + x1) * 4;
  const p01 = (y1 * srcWidth + x0) * 4;
  const p11 = (y1 * srcWidth + x1) * 4;
  for (let channel = 0; channel < 4; channel += 1) {
    const top = src[p00 + channel] * (1 - wx) + src[p10 + channel] * wx;
    const bottom = src[p01 + channel] * (1 - wx) + src[p11 + channel] * wx;
    out[at + channel] = Math.round(top * (1 - wy) + bottom * wy) & 0xff;
  }
}

/**
 * Fits an image into a target box the way the editor's modes describe it: `cover` scales it to fill
 * the box and crops the overflow, `contain` scales it inside and centres it on black, and `stretch`
 * fills the box whatever the aspect ratio. The resampler is bilinear and lives here rather than on a
 * canvas so it is deterministic and can be tested without a browser.
 */
export function fitRgba(
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: SplashFit,
): FittedImage {
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const scale =
    fit === "stretch"
      ? 1
      : fit === "cover"
        ? Math.max(targetWidth / srcWidth, targetHeight / srcHeight)
        : Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
  // Where the scaled image lands in the target box: centred, so "cover" hangs over the edges (and is
  // cropped) while "contain" leaves the rest of the box black.
  const drawnWidth = fit === "stretch" ? targetWidth : Math.max(1, Math.round(srcWidth * scale));
  const drawnHeight = fit === "stretch" ? targetHeight : Math.max(1, Math.round(srcHeight * scale));
  const offsetX = (targetWidth - drawnWidth) / 2;
  const offsetY = (targetHeight - drawnHeight) / 2;

  for (let y = 0; y < targetHeight; y += 1) {
    const drawnY = y - offsetY;
    if (drawnY < 0 || drawnY >= drawnHeight) continue;
    for (let x = 0; x < targetWidth; x += 1) {
      const drawnX = x - offsetX;
      if (drawnX < 0 || drawnX >= drawnWidth) continue;
      sampleBilinear(
        src,
        srcWidth,
        srcHeight,
        ((drawnX + 0.5) * srcWidth) / drawnWidth - 0.5,
        ((drawnY + 0.5) * srcHeight) / drawnHeight - 0.5,
        out,
        (y * targetWidth + x) * 4,
      );
    }
  }
  return { rgba: out, width: targetWidth, height: targetHeight };
}
