import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listZip, parsePayload, payloadPartitionSource, storedEntrySource } from "@/core/package";
import { parseSplash, readBmpInfo, readSplashFrameBmp } from "@/core/logo";
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
