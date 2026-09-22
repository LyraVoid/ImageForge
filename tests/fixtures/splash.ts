import { encodeGzip } from "@/core/image/gzip";
import { encodeBmp } from "@/core/logo";

/**
 * Builds a splash image by hand, small enough for a unit test: the magic at 0x4000, three reserved
 * blocks, the header info, one 0x80 entry per frame and the gzipped BMPs from 0x8000 on. It leaves
 * room at the end, the way real partitions do, so a test can check that a repack keeps the size.
 */
export interface SplashFixtureFrame {
  name: string;
  width: number;
  height: number;
  color: [number, number, number];
}

const MAGIC_OFFSET = 0x4000;
const DATA_OFFSET = 0x8000;
const METADATA_SIZE = 0x80;
const NAME_SIZE = 0x74;

function writeU32(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 4).setUint32(0, value >>> 0, true);
}

export async function buildSplash(
  frames: SplashFixtureFrame[],
  options: { screenWidth?: number; screenHeight?: number; slackBytes?: number } = {},
): Promise<Uint8Array> {
  const streams: Uint8Array[] = [];
  for (const frame of frames) {
    const rgba = new Uint8Array(frame.width * frame.height * 4);
    for (let index = 0; index < frame.width * frame.height; index += 1) {
      rgba[index * 4] = frame.color[0];
      rgba[index * 4 + 1] = frame.color[1];
      rgba[index * 4 + 2] = frame.color[2];
      rgba[index * 4 + 3] = 255;
    }
    streams.push(await encodeGzip(encodeBmp(rgba, frame.width, frame.height)));
  }

  const dataSize = streams.reduce((sum, stream) => sum + stream.length, 0);
  const needed = DATA_OFFSET + dataSize;
  const total = needed + (options.slackBytes ?? 4096);
  const out = new Uint8Array(total);
  out.set(new TextEncoder().encode("SPLASH LOGO!"), MAGIC_OFFSET);

  const headerAt = MAGIC_OFFSET + 12 + 3 * 0x40 + 0x40;
  writeU32(out, headerAt, frames.length);
  writeU32(out, headerAt + 4, 4);
  writeU32(out, headerAt + 8, options.screenWidth ?? 1080);
  writeU32(out, headerAt + 12, options.screenHeight ?? 1920);
  writeU32(out, headerAt + 16, 1);

  let offset = 0;
  frames.forEach((frame, index) => {
    const at = headerAt + 20 + index * METADATA_SIZE;
    writeU32(out, at, offset);
    writeU32(out, at + 4, streams[index].length === 0 ? 0 : encodedSize(frame));
    writeU32(out, at + 8, streams[index].length);
    const name = new TextEncoder().encode(frame.name);
    out.set(name.subarray(0, NAME_SIZE), at + 12);
    out.set(streams[index], DATA_OFFSET + offset);
    offset += streams[index].length;
  });
  return out;
}

/** The BMP size of a fixture frame, which is what the metadata's real size field has to say. */
function encodedSize(frame: SplashFixtureFrame): number {
  const rowSize = Math.ceil((frame.width * 3) / 4) * 4;
  return 54 + rowSize * frame.height;
}
