import { describe, expect, it } from "vitest";
import {
  APATCH_DEFAULT_FLAVOR,
  APATCH_FLAVORS,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
} from "@/core";
import { IncompatibleProviderError } from "@/core/errors";
import { parseImage } from "@/core/image";
import { encodeLz4 } from "@/core/image/lz4";
import { buildBootImage, makeKernel, makeRamdisk } from "../fixtures/bootimg";
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

  it("refuses a kernel compressed with a container it cannot expand", async () => {
    const zstdKernel = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00, 0x00, 0x00]);
    const analyzed = await engine.analyze(await buildBootImage({ kernel: zstdKernel }));
    const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "apatch");
    expect(candidate?.warnings.map((warning) => warning.code)).toContain("unsupported-kernel-compression");

    await expect(
      engine.plan({
        image: analyzed.image,
        sourceImageSha256: analyzed.sha256,
        providerId: "apatch",
        options: {},
      }),
    ).rejects.toThrowError(IncompatibleProviderError);
  });

  it("expands an LZ4 kernel before the preflight and fails on kallsyms, not on compression", async () => {
    const raw = makeKernel(8192);
    const compressed = await encodeLz4(raw, { kind: "lz4-legacy", blockMaxSize: 8 * 1024 * 1024 });
    const analyzed = await engine.analyze(await buildBootImage({ kernel: compressed }));
    const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "apatch");

    expect(candidate?.compatible).toBe(true);
    expect(candidate?.warnings.map((warning) => warning.code)).not.toContain("unsupported-kernel-compression");

    const provider = engine.providers.get("apatch");
    try {
      await provider?.resolve(analyzed.image, {}, analyzed.sha256);
      throw new Error("expected the preflight to reject a kernel without CONFIG_KALLSYMS");
    } catch (error) {
      expect(error).toBeInstanceOf(IncompatibleProviderError);
      expect((error as IncompatibleProviderError).technical).toMatch(/CONFIG_KALLSYMS/);
    }
  }, 120000);

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

  it("maps each flavour to a bundled core image and the manager it trusts", () => {
    expect(APATCH_DEFAULT_FLAVOR).toBe("upstream");
    expect(APATCH_FLAVORS.map((flavor) => flavor.id)).toEqual(["upstream", "aster"]);

    for (const flavor of APATCH_FLAVORS) {
      const resolved = artifacts.resolve({ providerId: "apatch", artifactId: flavor.artifactId });
      expect(resolved.artifact.id).toBe(flavor.artifactId);
      expect(resolved.artifact.sha256).toBeDefined();
      expect(resolved.artifact.sizeBytes).toBeGreaterThan(0);
      expect(flavor.managerPackage).toMatch(/^me\./);
    }

    expect(APATCH_FLAVORS[0].managerPackage).toBe("me.bmax.apatch");
    expect(APATCH_FLAVORS[1].managerPackage).toBe("me.yuki.aster");
  });

  it("rejects an unknown KernelPatch flavour", async () => {
    const analyzed = await engine.analyze(await buildBootImage({}));
    const provider = engine.providers.get("apatch");
    await expect(
      provider?.resolve(analyzed.image, { configuration: { kernelPatchFlavor: "nope" } }, analyzed.sha256),
    ).rejects.toThrowError(IncompatibleProviderError);
  });

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
