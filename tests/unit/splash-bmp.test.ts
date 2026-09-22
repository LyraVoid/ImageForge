import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listZip, parsePayload, payloadPartitionSource, storedEntrySource } from "@/core/package";
import { adaptImage, decodeBmp, encodeBmp, fitRgba, readBmpInfo, parseSplash, readSplashFrameBmp } from "@/core/logo";
import { sha256Hex } from "@/core/hash";
import { buildBmp } from "../fixtures/bmp";
import { fileSource } from "../fixtures/file-source";

const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOtaPackage = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);

function rgbaOf(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const at = (y * width + x) * 4;
      rgba[at] = r;
      rgba[at + 1] = g;
      rgba[at + 2] = b;
      rgba[at + 3] = a;
    }
  }
  return rgba;
}

function pixelAt(rgba: Uint8Array, width: number, x: number, y: number): number[] {
  const at = (y * width + x) * 4;
  return [rgba[at], rgba[at + 1], rgba[at + 2], rgba[at + 3]];
}

describe("the BMP codec", () => {
  it("writes the layout splash frames use: 24 bit, bottom up, BGR, padded rows", () => {
    const rgba = rgbaOf(5, 2, (_x, y) => (y === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const bmp = encodeBmp(rgba, 5, 2);
    const info = readBmpInfo(bmp);

    expect(info.width).toBe(5);
    expect(info.height).toBe(2);
    expect(info.bitsPerPixel).toBe(24);
    expect(info.compression).toBe(0);
    expect(info.pixelOffset).toBe(54);
    expect(info.headerSize).toBe(40);
    // five pixels are 15 bytes, padded to 16
    expect(bmp.length).toBe(54 + 16 * 2);
    expect(info.sizeBytes).toBe(bmp.length);
    // the standard 72 dpi resolution, unless the caller names the value the original frame had
    expect(new DataView(bmp.buffer).getInt32(38, true)).toBe(2835);
    expect(new DataView(bmp.buffer).getInt32(42, true)).toBe(2835);
    expect(new DataView(encodeBmp(rgba, 5, 2, { pixelsPerMeter: 0 }).buffer).getInt32(38, true)).toBe(0);

    // the first stored row is the bottom one, and the bytes are BGR: blue is stored first
    expect([...bmp.subarray(54, 57)]).toEqual([255, 0, 0]);
    expect([...bmp.subarray(54 + 16, 54 + 16 + 3)]).toEqual([0, 0, 255]);
    // the padding bytes stay zero
    expect([...bmp.subarray(54 + 15, 54 + 16)]).toEqual([0]);
  });

  it("round-trips its own output, alpha dropped as the format has no room for it", () => {
    const rgba = rgbaOf(3, 2, (x, y) => [x * 40, y * 90, 200 - x * 10, 128]);
    const decoded = decodeBmp(encodeBmp(rgba, 3, 2));

    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        expect(pixelAt(decoded.rgba, 3, x, y), x + "," + y).toEqual([x * 40, y * 90, 200 - x * 10, 255]);
      }
    }
  });

  it("refuses the BMP shapes no splash frame uses", () => {
    const eightBit = buildBmp(2, 2, () => [0, 0, 0]);
    eightBit[28] = 8;
    eightBit[29] = 0;
    expect(() => decodeBmp(eightBit)).toThrowError(/24 or 32 bit/);

    const rle = buildBmp(2, 2, () => [0, 0, 0]);
    new DataView(rle.buffer).setUint32(30, 1, true);
    expect(() => decodeBmp(rle)).toThrowError(/compressed/);

    const topDown = buildBmp(2, 2, () => [0, 0, 0]);
    new DataView(topDown.buffer).setInt32(22, -2, true);
    expect(() => decodeBmp(topDown)).toThrowError(/top down/);
  });
});

describe("adapting an image to a frame", () => {
  it("leaves the image alone in direct mode", () => {
    const rgba = rgbaOf(4, 3, (x, y) => [x, y, 7, 255]);
    const adapted = adaptImage(rgba, 4, 3, {
      mode: "direct",
      frame: { index: 0, name: "boot", offset: 0, realSize: 0, compressedSize: 0 },
      image: { width: 4, height: 3 },
    });

    expect(adapted.width).toBe(4);
    expect(adapted.height).toBe(3);
    expect(adapted.fit).toBe("none");
    expect([...adapted.rgba]).toEqual([...rgba]);
  });

  it("crops to the frame's size in followOriginal mode and stretches in autoAdapt", () => {
    // a 4x2 image with one distinct colour per column
    const rgba = rgbaOf(4, 2, (x) => [x * 60, 0, 0, 255]);
    const frame = { index: 0, name: "boot", offset: 0, realSize: 0, compressedSize: 0 };

    const cover = adaptImage(rgba, 4, 2, { mode: "followOriginal", frame, image: { width: 4, height: 2 }, originalWidth: 2, originalHeight: 2 });
    expect(cover.fit).toBe("cover");
    expect([cover.width, cover.height]).toEqual([2, 2]);
    // cover keeps the middle of the image: columns 1 and 2
    expect(pixelAt(cover.rgba, 2, 0, 0)[0]).toBe(60);
    expect(pixelAt(cover.rgba, 2, 1, 0)[0]).toBe(120);

    const stretched = adaptImage(rgba, 4, 2, { mode: "autoAdapt", frame, image: { width: 4, height: 2 }, originalWidth: 4, originalHeight: 4 });
    expect(stretched.fit).toBe("stretch");
    expect([stretched.width, stretched.height]).toEqual([4, 2]);
    // stretched keeps its own size when the image is smaller than the frame
    expect(pixelAt(stretched.rgba, 4, 3, 0)[0]).toBe(180);

    const shrunk = adaptImage(rgba, 4, 2, { mode: "autoAdapt", frame, image: { width: 4, height: 2 }, originalWidth: 2, originalHeight: 1 });
    expect([shrunk.width, shrunk.height]).toEqual([2, 1]);
  });

  it("letterboxes in contain mode and fills the box in stretch mode", () => {
    // a wide image in a square box: contain has to leave bars above and below
    const rgba = rgbaOf(4, 2, () => [255, 255, 255, 255]);

    const contained = fitRgba(rgba, 4, 2, 4, 4, "contain");
    expect(pixelAt(contained.rgba, 4, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(contained.rgba, 4, 3, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(contained.rgba, 4, 0, 1)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(contained.rgba, 4, 3, 3)).toEqual([0, 0, 0, 0]);

    const stretched = fitRgba(rgba, 4, 2, 4, 4, "stretch");
    expect(pixelAt(stretched.rgba, 4, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(stretched.rgba, 4, 3, 3)).toEqual([255, 255, 255, 255]);
  });

  it("uses the requested size in custom mode and refuses an empty one", () => {
    const rgba = rgbaOf(2, 2, () => [10, 20, 30, 255]);
    const frame = { index: 0, name: "boot", offset: 0, realSize: 0, compressedSize: 0 };

    const custom = adaptImage(rgba, 2, 2, { mode: "custom", frame, image: { width: 2, height: 2 }, customWidth: 6, customHeight: 3 });
    expect([custom.width, custom.height]).toEqual([6, 3]);
    expect(custom.fit).toBe("cover");

    expect(() =>
      adaptImage(rgba, 2, 2, { mode: "custom", frame, image: { width: 2, height: 2 }, customWidth: 0, customHeight: 3 }),
    ).toThrowError(/positive/);
  });
});

describe.skipIf(!hasOtaPackage)("the real splash frames through the codec", () => {
  it("decodes and re-encodes real frames back to the exact bytes in the image", async () => {
    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    const payload = await parsePayload(payloadSource);
    const splash = payloadPartitionSource(payloadSource, payload, "splash");
    const parsed = await parseSplash(splash);

    // A representative set: the two frames whose vendor files carry trailing bytes, the ones with a
    // zero resolution field, and a couple of small banners. Decoding every frame costs about half a
    // minute, so the rest are covered by the packer's verbatim test instead.
    const names = ["boot_charger_low_battery3", "black", "engineering", "wlan"];
    let checked = 0;
    const trailingReport: string[] = [];
    for (const name of names) {
      const frame = parsed.frames.find((candidate) => candidate.name.trim() === name);
      expect(frame, name).toBeDefined();
      const bmp = await readSplashFrameBmp(splash, frame as never);
      const info = readBmpInfo(bmp);
      const decoded = decodeBmp(bmp);
      const payloadBytes = 54 + Math.ceil((decoded.width * 3) / 4) * 4 * decoded.height;
      const trailing = bmp.length - payloadBytes;
      if (trailing > 0) {
        expect([...bmp.subarray(payloadBytes)], name).toEqual(new Array(trailing).fill(0));
        trailingReport.push(name + "+" + trailing);
      }

      const reencoded = encodeBmp(decoded.rgba, decoded.width, decoded.height, {
        pixelsPerMeter: info.pixelsPerMeter,
        trailingBytes: trailing,
      });
      expect(reencoded.length, name).toBe(bmp.length);
      // digests rather than element-wise equality: these frames are ten megabytes each
      expect(await sha256Hex(reencoded), name).toBe(await sha256Hex(bmp));
      expect([...reencoded.subarray(0, 64)], name).toEqual([...bmp.subarray(0, 64)]);
      checked += 1;
    }
    console.log("frames reproduced byte for byte:", checked, "| vendor frames with trailing bytes:", trailingReport.join(", ") || "none");
    expect(checked).toBe(names.length);
  }, 900000);
});
