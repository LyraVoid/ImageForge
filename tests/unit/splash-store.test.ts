import { beforeEach, describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import { decodeBmp, parseSplash, readSplashFrameBmp } from "@/core/logo";
import { useForgeStore } from "@/stores/forge-store";
import { toFile } from "../fixtures/bootimg";
import { buildSplash } from "../fixtures/splash";

const store = () => useForgeStore.getState();

function solid(width: number, height: number, color: [number, number, number]): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = color[0];
    rgba[index * 4 + 1] = color[1];
    rgba[index * 4 + 2] = color[2];
    rgba[index * 4 + 3] = 255;
  }
  return rgba;
}

function pixelAt(rgba: Uint8Array, width: number, x: number, y: number): number[] {
  const at = (y * width + x) * 4;
  return [rgba[at], rgba[at + 1], rgba[at + 2], rgba[at + 3]];
}

beforeEach(async () => {
  await store().reset();
});

describe("the splash editor's data path", () => {
  it("lists the frames of an image and previews one", async () => {
    const image = await buildSplash([
      { name: "boot", width: 8, height: 4, color: [200, 0, 0] },
      { name: "at", width: 4, height: 2, color: [0, 0, 200] },
    ]);
    await store().analyzeFile(toFile(image, "splash.img"));

    const summary = await store().loadSplash();
    expect(summary?.frames.map((frame) => frame.name.trim())).toEqual(["boot", "at"]);
    expect(summary?.frames[0]).toMatchObject({ width: 8, height: 4, bitsPerPixel: 24 });
    expect(summary?.headerWidth).toBe(1080);
    expect(summary?.sizeBytes).toBe(image.length);

    const preview = await store().readSplashFramePreview(0);
    expect(preview?.width).toBe(8);
    expect(pixelAt(preview?.rgba as Uint8Array, 8, 0, 0)).toEqual([200, 0, 0, 255]);

    // the same frame is only read once
    expect(await store().readSplashFramePreview(0)).toBe(preview);
  });

  it("adapts a replacement to the frame and packs it without changing the image size", async () => {
    const image = await buildSplash([
      { name: "boot", width: 8, height: 4, color: [200, 0, 0] },
      { name: "at", width: 4, height: 2, color: [0, 0, 200] },
    ]);
    await store().analyzeFile(toFile(image, "splash.img"));
    await store().loadSplash();

    store().setSplashMode("followOriginal");
    const replacement = store().replaceSplashFrame(1, {
      name: "green.png",
      rgba: solid(4, 2, [0, 255, 0]),
      width: 4,
      height: 2,
    });
    expect(replacement?.target).toEqual({ width: 4, height: 2 });
    expect(replacement?.fit).toBe("cover");
    expect(replacement?.sourceName).toBe("green.png");
    expect(pixelAt(replacement?.preview.rgba as Uint8Array, 4, 0, 0)).toEqual([0, 255, 0, 255]);

    const artifact = await store().packSplash();
    expect(artifact).not.toBeNull();
    expect(artifact?.params?.replaced).toBe("1");
    expect(artifact?.sizeBytes).toBe(image.length);

    const packed = await store().readArtifactBytes(artifact?.id as string);
    const reparsed = await parseSplash(bytesSource(packed as Uint8Array));
    expect(reparsed.frames.map((frame) => frame.name.trim())).toEqual(["boot", "at"]);

    // the replaced frame holds the new pixels; the untouched frame is byte for byte the old stream
    const replaced = decodeBmp(await readSplashFrameBmp(bytesSource(packed as Uint8Array), reparsed.frames[1]));
    expect(replaced.width).toBe(4);
    expect(pixelAt(replaced.rgba, 4, 0, 0)).toEqual([0, 255, 0, 255]);
    const untouched = decodeBmp(await readSplashFrameBmp(bytesSource(packed as Uint8Array), reparsed.frames[0]));
    expect(pixelAt(untouched.rgba, 8, 0, 0)).toEqual([200, 0, 0, 255]);
  });

  it("grows the image when the replacement needs more room, and says by how much", async () => {
    const image = await buildSplash([{ name: "boot", width: 8, height: 4, color: [10, 20, 30] }], {
      slackBytes: 0,
    });
    await store().analyzeFile(toFile(image, "splash.img"));
    await store().loadSplash();

    store().setSplashMode("custom", { width: 64, height: 64 });
    store().replaceSplashFrame(0, { name: "big.png", rgba: solid(64, 64, [9, 9, 9]), width: 64, height: 64 });

    const artifact = await store().packSplash();
    expect(Number(artifact?.params?.sizeDelta)).toBeGreaterThan(0);
    expect(artifact?.sizeBytes).toBeGreaterThan(image.length);
  });

  it("clears a replacement again", async () => {
    const image = await buildSplash([{ name: "boot", width: 4, height: 4, color: [1, 2, 3] }]);
    await store().analyzeFile(toFile(image, "splash.img"));
    await store().loadSplash();
    store().setSplashMode("direct");
    store().replaceSplashFrame(0, { name: "x.png", rgba: solid(4, 4, [5, 6, 7]), width: 4, height: 4 });
    expect(Object.keys(store().splashReplacements)).toHaveLength(1);

    store().clearSplashReplacement(0);
    expect(Object.keys(store().splashReplacements)).toHaveLength(0);
  });
});
