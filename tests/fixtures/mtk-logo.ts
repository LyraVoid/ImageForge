import { encodeZlib } from "@/core/image";
import { MTK_HEADER_SIZE } from "@/core/logo";
import type { MtkLayout } from "@/core/logo";

/**
 * Builds a MediaTek logo image by hand for tests: a 512 byte header with the format's "logo" magic,
 * then the block table and one zlib stream per block. The pixels are written in a chosen layout so a
 * test can check the decoding without needing a real device image.
 */
export interface MtkFixtureFrame {
  width: number;
  height: number;
  layout: Omit<MtkLayout, "width" | "height">;
  /** RGBA, row by row from the top. */
  rgba: Uint8Array;
}

export function encodeMtkFixtureFrame(frame: MtkFixtureFrame): Uint8Array {
  const { bytesPerPixel, stride, prefixBytes } = frame.layout;
  const raw = new Uint8Array(prefixBytes + stride * frame.height);
  for (let y = 0; y < frame.height; y += 1) {
    const row = prefixBytes + y * stride;
    for (let x = 0; x < frame.width; x += 1) {
      const from = (y * frame.width + x) * 4;
      const at = row + x * bytesPerPixel;
      if (bytesPerPixel === 2) {
        const packed =
          (Math.round((frame.rgba[from] * 31) / 255) & 31) |
          ((Math.round((frame.rgba[from + 1] * 63) / 255) & 63) << 5) |
          ((Math.round((frame.rgba[from + 2] * 31) / 255) & 31) << 11);
        raw[at] = packed & 0xff;
        raw[at + 1] = (packed >> 8) & 0xff;
      } else if (bytesPerPixel === 3) {
        raw[at] = frame.rgba[from + 2];
        raw[at + 1] = frame.rgba[from + 1];
        raw[at + 2] = frame.rgba[from];
      } else {
        raw[at] = frame.rgba[from + 2];
        raw[at + 1] = frame.rgba[from + 1];
        raw[at + 2] = frame.rgba[from];
        raw[at + 3] = frame.rgba[from + 3];
      }
    }
  }
  return raw;
}

export async function buildMtkLogo(frames: MtkFixtureFrame[], slackBytes = 0): Promise<Uint8Array> {
  const blocks: Uint8Array[] = [];
  for (const frame of frames) blocks.push(await encodeZlib(encodeMtkFixtureFrame(frame)));

  const tableSize = 8 + blocks.length * 4;
  const payloadSize = tableSize + blocks.reduce((sum, block) => sum + block.length, 0);
  const total = MTK_HEADER_SIZE + payloadSize + slackBytes;
  const out = new Uint8Array(total);
  // the format's magic sits at file offset 8, inside the 512 byte header
  out.set(new TextEncoder().encode("logo"), 8);
  const view = new DataView(out.buffer, out.byteOffset);
  view.setUint32(MTK_HEADER_SIZE, blocks.length, true);
  let cursor = tableSize;
  blocks.forEach((block, index) => {
    view.setUint32(MTK_HEADER_SIZE + 8 + index * 4, cursor, true);
    out.set(block, MTK_HEADER_SIZE + cursor);
    cursor += block.length;
  });
  view.setUint32(MTK_HEADER_SIZE + 4, cursor, true);
  return out;
}
