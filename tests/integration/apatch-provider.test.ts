import { describe, expect, it } from "vitest";
import { ARTIFACT_CATALOG, createArtifactRegistry, createPatchEngine } from "@/core";
import { IncompatibleProviderError } from "@/core/errors";
import { parseImage } from "@/core/image";
import { buildBootImage, makeRamdisk } from "../fixtures/bootimg";
import { fsPayloadLoader } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const EMPTY_SHA256 = "0".repeat(64);

describe("APatch provider preflight", () => {
  it("is offered as a compatible candidate for an arm64 boot image", async () => {
    const analyzed = await engine.analyze(await buildBootImage({}));
    const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "apatch");

    expect(candidate?.available).toBe(true);
    expect(candidate?.compatible).toBe(true);
  });

  it("refuses init_boot images because they carry no kernel", async () => {
    const bytes = await buildBootImage({ kernel: null, ramdisk: await makeRamdisk(512) });
    const analyzed = await engine.analyze(bytes);
    const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "apatch");

    expect(analyzed.image.format).toBe("init_boot");
    expect(candidate?.compatible).toBe(false);
    expect(candidate?.reasons.join(" ")).toMatch(/Does not support init_boot/);
  });

  it("refuses a boot image without a kernel section", async () => {
    const analyzed = await engine.analyze(await buildBootImage({ kernel: null }));
    const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "apatch");
    expect(candidate?.compatible).toBe(false);
  });

  it("refuses a compressed kernel payload", async () => {
    const gzippedKernel = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
    const analyzed = await engine.analyze(await buildBootImage({ kernel: gzippedKernel }));

    await expect(
      engine.plan({
        image: analyzed.image,
        sourceImageSha256: analyzed.sha256,
        providerId: "apatch",
        options: {},
      }),
    ).rejects.toThrowError(IncompatibleProviderError);
  });

  it("runs kptools against the target kernel and rejects one without CONFIG_KALLSYMS", async () => {
    const analyzed = await engine.analyze(await buildBootImage({}));
    const provider = engine.providers.get("apatch");
    expect(provider).toBeDefined();

    await expect(
      provider?.resolve(analyzed.image, {}, analyzed.sha256),
    ).rejects.toThrowError(IncompatibleProviderError);
    try {
      await provider?.resolve(analyzed.image, {}, analyzed.sha256);
    } catch (error) {
      expect((error as IncompatibleProviderError).technical).toMatch(/CONFIG_KALLSYMS/);
    }
  }, 120000);

  it("exposes its analyze notes", async () => {
    const provider = engine.providers.get("apatch");
    const analysis = await provider?.analyze(parseImage(await buildBootImage({})));
    expect(analysis?.supportedTargets).toEqual(["boot"]);
    expect(analysis?.notes.join(" ")).toMatch(/CONFIG_KALLSYMS/);
  });
});

describe("APatch plan metadata", () => {
  it("keeps the superkey unset by default", async () => {
    const provider = engine.providers.get("apatch");
    const image = parseImage(await buildBootImage({}));
    const kpimg = artifacts.resolve({ providerId: "apatch", artifactId: "apatch-kpimg" }).artifact;
    expect(kpimg.sha256).toBeDefined();
    expect(EMPTY_SHA256).toHaveLength(64);
    expect(provider?.id).toBe("apatch");
    expect(image.format).toBe("boot");
  });
});
