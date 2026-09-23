import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import {
  MTK_HEADER_SIZE,
  decodeMtkPixels,
  detectMtkLayout,
  encodeMtkPixels,
  packMtkLogo,
  parseMtkLogo,
  readMtkFrameRaw,
} from "@/core/logo";
import { WorkerError } from "@/core/errors";
import { sha256Hex } from "@/core/hash";
import { buildMtkLogo } from "../fixtures/mtk-logo";
import type { MtkFixtureFrame } from "../fixtures/mtk-logo";

const SAMPLE = process.env.IMAGEFORGE_MTK_LOGO ?? ".research/mtk-logo/sample-logo.img";
const hasSample = existsSync(SAMPLE);

function solid(width: number, height: number, color: [number, number, number, number]): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = color[0];
    rgba[index * 4 + 1] = color[1];
    rgba[index * 4 + 2] = color[2];
    rgba[index * 4 + 3] = color[3];
  }
  return rgba;
}

const frame = (
  width: number,
  height: number,
  layout: MtkFixtureFrame["layout"],
  color: [number, number, number, number],
): MtkFixtureFrame => ({ width, height, layout, rgba: solid(width, height, color) });

describe("the MediaTek logo container", () => {
  it("infers the layout of a block the way the reference implementation does", () => {
    // 720x1600 at four bytes per pixel, which is what a real Xiaomi image turned out to be
    expect(detectMtkLayout(720 * 1600 * 4, 720, 1600)).toEqual({
      bytesPerPixel: 4,
      stride: 2880,
      prefixBytes: 0,
      width: 720,
      height: 1600,
    });
    // a row that has to be padded to a 32 byte boundary, with a prefix
    expect(detectMtkLayout(16 + 96 * 10, 30, 10)?.stride).toBe(96);
    // a length no layout explains
    expect(detectMtkLayout(12345, 720, 1600)).toBeNull();
  });

  it("round-trips pixels through every layout it supports", () => {
    const layouts = [
      { bytesPerPixel: 2, stride: 20, prefixBytes: 0, width: 10, height: 4 },
      { bytesPerPixel: 3, stride: 36, prefixBytes: 4, width: 10, height: 4 },
      { bytesPerPixel: 4, stride: 40, prefixBytes: 0, width: 10, height: 4 },
    ];
    for (const layout of layouts) {
      const rgba = new Uint8Array(layout.width * layout.height * 4);
      for (let index = 0; index < layout.width * layout.height; index += 1) {
        rgba[index * 4] = (index * 7) % 256;
        rgba[index * 4 + 1] = (index * 13) % 256;
        rgba[index * 4 + 2] = (index * 29) % 256;
        rgba[index * 4 + 3] = 255;
      }
      const raw = encodeMtkPixels(rgba, layout);
      const decoded = decodeMtkPixels(raw, layout);
      // two byte pixels are 565, so only a few bits survive
      const tolerance = layout.bytesPerPixel === 2 ? 9 : 0;
      for (let index = 0; index < layout.width * layout.height * 4; index += 1) {
        if (index % 4 === 3) continue;
        expect(Math.abs(decoded[index] - rgba[index]), layout.bytesPerPixel + " at " + index).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it("parses a container, names the frames by index and keeps untouched blocks verbatim", async () => {
    // A hundred pixel row of four byte pixels is 400 bytes; a two byte row padded to any of the known
    // alignments (or with any prefix) cannot account for 400 * 60, so this frame is unambiguous. Small
    // frames are not, which is why the tool takes a resolution and shows a preview.
    const image = await buildMtkLogo(
      [
        frame(100, 60, { bytesPerPixel: 4, stride: 400, prefixBytes: 0 }, [200, 0, 0, 255]),
        frame(50, 30, { bytesPerPixel: 2, stride: 100, prefixBytes: 0 }, [0, 0, 200, 255]),
      ],
      64,
    );
    const source = bytesSource(image);
    const parsed = await parseMtkLogo(source, { width: 100, height: 60 });

    expect(parsed.blockCount).toBe(2);
    expect(parsed.frames[0].layout).toMatchObject({ bytesPerPixel: 4, stride: 400, prefixBytes: 0 });
    expect(parsed.frames[0].rawSize).toBe(400 * 60);
    // the second block is 50x30, so at the 100x60 resolution its layout cannot be explained
    expect(parsed.frames[1].layout).toBeNull();
    expect(parsed.header.length).toBe(MTK_HEADER_SIZE);
    expect(new TextDecoder().decode(parsed.header.subarray(8, 12))).toBe("logo");

    // rebuilding without changes reproduces the image byte for byte
    const unchanged = await packMtkLogo(
      source,
      parsed,
      parsed.frames.map((entry) => ({ kind: "keep", frame: entry }) as const),
    );
    expect(unchanged.replaced).toBe(0);
    expect(unchanged.bytes.length).toBe(image.length);
    expect(await sha256Hex(unchanged.bytes)).toBe(await sha256Hex(image));
  });

  it("finds a block's layout when that frame is given its own size", async () => {
    // a full screen frame and a small icon: the icon's size is nowhere in the container
    // a hundred pixel row of four byte pixels is 400 bytes, which no two byte row explains
    const image = await buildMtkLogo([
      frame(720, 1600, { bytesPerPixel: 4, stride: 2880, prefixBytes: 0 }, [10, 20, 30, 255]),
      frame(100, 60, { bytesPerPixel: 4, stride: 400, prefixBytes: 0 }, [200, 100, 0, 255]),
    ]);

    const blind = await parseMtkLogo(bytesSource(image), { width: 720, height: 1600 });
    expect(blind.frames[1].layout).toBeNull();

    const seen = await parseMtkLogo(bytesSource(image), { width: 720, height: 1600 }, {
      "1": { width: 100, height: 60 },
    });
    expect(seen.frames[1].layout).toMatchObject({ bytesPerPixel: 4, stride: 400, prefixBytes: 0 });
    // and with a layout that frame can be decoded, which is what makes it editable
    const rgba = decodeMtkPixels(
      await readMtkFrameRaw(bytesSource(image), seen.frames[1]),
      seen.frames[1].layout as never,
    );
    expect(rgba.length).toBe(100 * 60 * 4);
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([200, 100, 0]);
  });

  it("replaces one block, keeps the others and pads back to the original size", async () => {
    const image = await buildMtkLogo(
      [
        frame(100, 60, { bytesPerPixel: 4, stride: 400, prefixBytes: 0 }, [200, 0, 0, 255]),
        frame(100, 60, { bytesPerPixel: 2, stride: 200, prefixBytes: 0 }, [0, 0, 200, 255]),
      ],
      64,
    );
    const source = bytesSource(image);
    const parsed = await parseMtkLogo(source, { width: 100, height: 60 });
    const green = solid(100, 60, [0, 255, 0, 255]);

    const packed = await packMtkLogo(source, parsed, [
      { kind: "replace", frame: parsed.frames[0], raw: encodeMtkPixels(green, parsed.frames[0].layout as never) },
      { kind: "keep", frame: parsed.frames[1] },
    ]);

    expect(packed.replaced).toBe(1);
    expect(packed.bytes.length).toBe(image.length);

    const check = bytesSource(packed.bytes);
    const reparsed = await parseMtkLogo(check, { width: 100, height: 60 });
    expect(reparsed.blockCount).toBe(2);
    const decoded = decodeMtkPixels(await readMtkFrameRaw(check, reparsed.frames[0]), reparsed.frames[0].layout as never);
    expect([decoded[0], decoded[1], decoded[2]]).toEqual([0, 255, 0]);

    // the block nobody touched is the same bytes as before
    const before = await readMtkFrameRaw(source, parsed.frames[1]);
    const after = await readMtkFrameRaw(check, reparsed.frames[1]);
    expect(await sha256Hex(after)).toBe(await sha256Hex(before));
  });
});

describe.skipIf(!hasSample)("a real MediaTek logo image", () => {
  it("parses the sample and rebuilds it byte for byte", async () => {
    const { fileSource } = await import("../fixtures/file-source");
    const source = fileSource(SAMPLE);
    const parsed = await parseMtkLogo(source, { width: 720, height: 1600 });

    expect(parsed.blockCount).toBe(69);
    // the largest block is the boot screen: 720 x 1600 at four bytes per pixel
    const largest = parsed.frames.reduce((best, entry) => (entry.rawSize > best.rawSize ? entry : best));
    expect(largest.rawSize).toBe(720 * 1600 * 4);
    expect(largest.layout).toMatchObject({ bytesPerPixel: 4, stride: 2880, prefixBytes: 0 });

    // decoding it gives a mostly black picture with a coloured logo in it, not noise
    const rgba = decodeMtkPixels(await readMtkFrameRaw(source, largest), largest.layout as never);
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([0, 0, 0]);
    const colours = new Set<string>();
    for (let index = 0; index < rgba.length; index += 4) {
      colours.add(rgba[index] + "," + rgba[index + 1] + "," + rgba[index + 2]);
      if (colours.size > 200) break;
    }
    expect(colours.size).toBeGreaterThan(100);

    // and rebuilding without changes reproduces the 2.8 MB image exactly
    const rebuilt = await packMtkLogo(
      source,
      parsed,
      parsed.frames.map((entry) => ({ kind: "keep", frame: entry }) as const),
    );
    expect(rebuilt.bytes.length).toBe(source.size);
    expect(await sha256Hex(rebuilt.bytes)).toBe(await sha256Hex(await source.read(0, source.size)));
  }, 300000);
});
describe("a MediaTek logo through the session", () => {
  const big = (color: [number, number, number, number]) =>
    frame(720, 1600, { bytesPerPixel: 4, stride: 2880, prefixBytes: 0 }, color);
  const icon = (color: [number, number, number, number]) =>
    frame(48, 60, { bytesPerPixel: 4, stride: 192, prefixBytes: 0 }, color);

  it("asks for the resolution, then lists and previews the blocks", async () => {
    const { PatchWorkerSession } = await import("@/workers/session");
    const image = await buildMtkLogo([big([10, 20, 30, 255]), icon([200, 0, 0, 255])], 128);
    const session = new PatchWorkerSession();
    const source = await session.openSource(image.buffer as ArrayBuffer, "logo.img");

    // without a resolution nothing can be made of the blocks
    const blind = await session.inspectSplash(source.id);
    expect(blind.format).toBe("mtk-logo");
    expect(blind.needsResolution).toBe(true);
    expect(blind.frames.every((entry) => entry.layout === null)).toBe(true);
    expect(blind.suggestions?.some((entry) => entry.width === 720 && entry.height === 1600)).toBe(true);

    const seen = await session.inspectSplash(source.id, undefined, { width: 720, height: 1600 });
    expect(seen.needsResolution).toBe(false);
    expect(seen.frames[0].layout).toMatchObject({ bytesPerPixel: 4, stride: 2880, prefixBytes: 0 });
    expect(seen.frames[0].width).toBe(720);
    expect(seen.frames[0].name).toBe("");
    // the icon is 48x60 and the screen is not, so it stays unexplained and is left alone
    expect(seen.frames[1].layout).toBeNull();

    const preview = await session.readSplashFramePreview(source.id, undefined, 0, { width: 720, height: 1600 });
    expect(preview.fullWidth).toBe(720);
    expect(preview.width).toBeLessThanOrEqual(240);
    expect(preview.rgba.byteLength).toBe(preview.width * preview.height * 4);

    await expect(session.readSplashFramePreview(source.id, undefined, 0)).rejects.toThrowError(WorkerError);
    await session.closeSource(source.id);
  });

  it("rebuilds the image, keeps blocks it did not touch and says so", async () => {
    const { PatchWorkerSession } = await import("@/workers/session");
    const image = await buildMtkLogo([big([10, 20, 30, 255]), big([40, 50, 60, 255])], 128);
    const session = new PatchWorkerSession();
    const source = await session.openSource(image.buffer as ArrayBuffer, "logo.img");
    const resolution = { width: 720, height: 1600 };

    // nothing replaced: the byte for byte check is what the page then shows
    const unchanged = await session.packSplashImage(source.id, undefined, [], resolution);
    expect(unchanged.params?.verified).toBe("identical");
    expect(unchanged.params?.format).toBe("mtk-logo");
    expect(unchanged.sizeBytes).toBe(image.length);

    // replace the second block with green pixels in its own layout
    const green = solid(720, 1600, [0, 255, 0, 255]);
    const payload = encodeMtkPixels(green, {
      bytesPerPixel: 4,
      stride: 2880,
      prefixBytes: 0,
      width: 720,
      height: 1600,
    });
    const patched = await session.packSplashImage(
      source.id,
      undefined,
      [{ index: 1, payload: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer }],
      resolution,
    );
    expect(patched.params?.replaced).toBe("1");
    expect(patched.params?.sizeDelta).toBe("0");
    expect(patched.params?.verified).toBe("frames-intact");

    // the rebuilt image reads back with the green frame and the untouched one intact
    const bytes = await session.readArtifact(patched.id, 0, patched.sizeBytes);
    const check = bytesSource(new Uint8Array(bytes));
    const reparsed = await parseMtkLogo(check, resolution);
    const decoded = decodeMtkPixels(await readMtkFrameRaw(check, reparsed.frames[1]), reparsed.frames[1].layout as never);
    expect([decoded[0], decoded[1], decoded[2]]).toEqual([0, 255, 0]);

    // the block nobody touched is the same bytes as in the original
    const original = await parseMtkLogo(bytesSource(image), resolution);
    const before = await readMtkFrameRaw(bytesSource(image), original.frames[0]);
    const after = await readMtkFrameRaw(check, reparsed.frames[0]);
    expect(await sha256Hex(after)).toBe(await sha256Hex(before));

    await session.closeSource(source.id);
  }, 60000);
});
