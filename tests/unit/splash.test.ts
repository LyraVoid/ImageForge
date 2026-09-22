import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bytesSource, listZip, parsePayload, payloadPartitionSource, storedEntrySource } from "@/core/package";
import { sha256Hex } from "@/core/hash";
import { buildBmp } from "../fixtures/bmp";
import {
  packSplash,
  parseSplash,
  readBmpInfo,
  readSplashFrameBmp,
  readSplashFrameCompressed,
} from "@/core/logo";
import { fileSource } from "../fixtures/file-source";

const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOtaPackage = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);

describe.skipIf(!hasOtaPackage)("the real splash partition", () => {
  it("reads the OPPO splash header and every frame", async () => {
    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    const payload = await parsePayload(payloadSource);
    const splash = payloadPartitionSource(payloadSource, payload, "splash");

    const parsed = await parseSplash(splash);
    console.log(
      "splash header: ddph=" + parsed.hasDdph +
        " frames=" + parsed.imgnumber +
        " screen=" + parsed.width + "x" + parsed.height +
        " unknow=" + parsed.unknow +
        " special=0x" + parsed.special.toString(16),
    );
    console.log(
      "frames:",
      parsed.frames.map((frame) => frame.index + ":" + frame.name.trim()).join(" "),
    );

    // frames are laid out back to back, which is what lets a repack keep untouched ones verbatim
    let expectedOffset = 0;
    for (const frame of parsed.frames) {
      expect(frame.offset, frame.name).toBe(expectedOffset);
      expectedOffset += frame.compressedSize;
    }
    expect(expectedOffset).toBeLessThanOrEqual(splash.size - 0x8000);
    console.log("data ends at", 0x8000 + expectedOffset, "in a", splash.size, "byte partition");

    // The header carries the screen size and each frame is its own BMP: some are the full screen,
    // some are small banners, and all of them are 24 bit uncompressed BMPs.
    const sizes: string[] = [];
    let widest = 0;
    let tallest = 0;
    const problems: string[] = [];
    for (const frame of parsed.frames) {
      const bmp = await readSplashFrameBmp(splash, frame);
      const info = readBmpInfo(bmp);
      sizes.push(
        frame.name.trim() + "=" + info.width + "x" + info.height + "/" + info.bitsPerPixel + "bpp/" +
          frame.compressedSize + "->" + bmp.length,
      );
      widest = Math.max(widest, info.width);
      tallest = Math.max(tallest, info.height);
      if (bmp.length !== frame.realSize) problems.push(frame.name.trim() + " realSize " + frame.realSize + " vs " + bmp.length);
      if (info.bitsPerPixel !== 24 || info.compression !== 0) problems.push(frame.name.trim() + " is " + info.bitsPerPixel + "bpp compression " + info.compression);
    }
    console.log("frame sizes:", sizes.join(" "));
    console.log("largest frame:", widest + "x" + tallest, "| header says", parsed.width + "x" + parsed.height, "| problems:", problems.join("; ") || "none");
    expect(problems, problems.join("; ")).toEqual([]);
    // The header's own width/height is *not* an upper bound for the frames: this device's header
    // says 1080x1920 while its real frames are 1440x3120. Anything that resizes to the header would
    // shrink the images the panel actually shows, so the sizes above are the ones that matter.
    expect(parsed.frames.length).toBeGreaterThan(10);
  }, 600000);
});
describe.skipIf(!hasOtaPackage)("packing the real splash image", () => {
  async function openSplash() {
    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    const payload = await parsePayload(payloadSource);
    const splash = payloadPartitionSource(payloadSource, payload, "splash");
    return { splash, parsed: await parseSplash(splash) };
  }

  it("reproduces an unmodified image byte for byte", async () => {
    const { splash, parsed } = await openSplash();
    const packed = await packSplash(
      splash,
      parsed,
      parsed.frames.map((frame) => ({ kind: "keep", frame }) as const),
    );

    expect(packed.bytes.length).toBe(splash.size);
    expect(packed.replaced).toBe(0);
    const { readAll } = await import("@/core/package");
    expect(await sha256Hex(packed.bytes)).toBe(await sha256Hex(await readAll(splash)));
  }, 600000);

  it("replaces one frame, keeps every other stream verbatim and stays the same size", async () => {
    const { splash, parsed } = await openSplash();
    const target = parsed.frames.find((frame) => frame.name.trim() === "wlan");
    expect(target).toBeDefined();
    // a flat colour: it compresses into less room than the frame it replaces, which is what the
    // original streams look like (a 487x69 banner takes 4084 bytes)
    const bmp = buildBmp(487, 69, () => [16, 32, 64]);

    const packed = await packSplash(
      splash,
      parsed,
      parsed.frames.map((frame) =>
        frame.index === target?.index ? ({ kind: "replace", index: frame.index, bmp } as const) : ({ kind: "keep", frame } as const),
      ),
    );

    expect(packed.replaced).toBe(1);
    expect(packed.bytes.length).toBe(splash.size);

    const repacked = bytesSource(packed.bytes);
    const reparsed = await parseSplash(repacked);
    expect(reparsed.frames.map((frame) => frame.name.trim())).toEqual(
      parsed.frames.map((frame) => frame.name.trim()),
    );

    // the replaced frame comes back as exactly the BMP that went in
    const replaced = reparsed.frames[target?.index ?? -1];
    expect(replaced.realSize).toBe(bmp.length);
    expect([...(await readSplashFrameBmp(repacked, replaced))]).toEqual([...bmp]);

    // and every other frame's stored stream is untouched, byte for byte
    for (const frame of parsed.frames) {
      if (frame.index === target?.index) continue;
      const before = await readSplashFrameCompressed(splash, frame);
      const after = await readSplashFrameCompressed(repacked, reparsed.frames[frame.index]);
      expect(after.length, frame.name).toBe(before.length);
      expect(await sha256Hex(after), frame.name).toBe(await sha256Hex(before));
    }
  }, 600000);

  it("grows when a replacement needs more room than the original had", async () => {
    const { splash, parsed } = await openSplash();
    const target = parsed.frames.find((frame) => frame.name.trim() === "at");
    expect(target).toBeDefined();
    // bigger in every direction, and loud enough that it cannot compress into the old stream
    const bmp = buildBmp(536, 600, (x, y) => [(x * 7 + y) % 256, (y * 13) % 256, (x + y) % 256]);

    const packed = await packSplash(
      splash,
      parsed,
      parsed.frames.map((frame) =>
        frame.index === target?.index ? ({ kind: "replace", index: frame.index, bmp } as const) : ({ kind: "keep", frame } as const),
      ),
    );

    expect(packed.sizeDelta).toBeGreaterThan(0);
    const reparsed = await parseSplash(bytesSource(packed.bytes));
    expect(reparsed.frames[target?.index ?? -1].realSize).toBe(bmp.length);
    expect(reparsed.frames.length).toBe(parsed.frames.length);
  }, 600000);
});
