import { describe, expect, it } from "vitest";
import { MOCK_BOOTCONFIG_MARKER, MOCK_CMDLINE_MARKER, createArtifactRegistry, createPatchEngine } from "@/core";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { sha256Hex } from "@/core/hash";
import { buildBootImage, buildVendorBootImage, makeRamdisk } from "../fixtures/bootimg";

const artifacts = createArtifactRegistry();
const engine = createPatchEngine({ artifacts });

describe("patch pipeline", () => {
  it("runs analyze, plan, patch and verify end to end", async () => {
    const bytes = await buildBootImage({ cmdline: "console=ttyMSM0,115200n8" });
    const analyzed = await engine.analyze(bytes);

    expect(analyzed.image.format).toBe("boot");
    expect(analyzed.sha256).toHaveLength(64);
    expect(analyzed.android.ramdisk).toBeInstanceOf(Uint8Array);
    expect(analyzed.compatibility.compatible).toBe(true);

    const steps: number[] = [];
    const stages: string[] = [];
    const outcome = await engine.run(analyzed.image, analyzed.sha256, "mock", {}, {
      onProgress: (event) => {
        steps.push(event.progress);
        stages.push(event.stage);
      },
    });

    expect(outcome.verification.verification.valid).toBe(true);
    expect(outcome.verification.artifactSha256).toBe(outcome.plan.artifact.sha256);
    expect(steps.at(0)).toBe(0);
    expect(steps.at(-1)).toBe(100);
    expect(stages).toContain("repack");
    expect(stages).toContain("complete");

    const patched = parseImage(outcome.result.bytes);
    expect(patched.cmdline).toContain(MOCK_CMDLINE_MARKER);
    const bootconfig = sectionOf(patched, "bootconfig");
    expect(bootconfig).toBeDefined();
    const manifest = new TextDecoder().decode(bootconfig?.data ?? new Uint8Array());
    expect(manifest).toContain(MOCK_BOOTCONFIG_MARKER + "=1");
    expect(manifest).toContain("imageforge_plan=" + outcome.plan.id);
    expect(manifest).toContain("imageforge_source_sha256=" + analyzed.sha256);

    expect(await sha256Hex(outcome.result.bytes)).toBe(outcome.result.sha256);
  });

  it("keeps the kernel bytes and only rewrites the cmdline for header v2", async () => {
    const kernel = new Uint8Array(2048).fill(7);
    const bytes = await buildBootImage({ headerVersion: 2, kernel, ramdisk: await makeRamdisk(1024) });
    const analyzed = await engine.analyze(bytes);
    const outcome = await engine.run(analyzed.image, analyzed.sha256, "mock", {});

    const patched = assertBootImage(parseImage(outcome.result.bytes));
    const patchedKernel = sectionOf(patched, "kernel");
    expect(Array.from(patchedKernel?.data ?? [])).toEqual(Array.from(kernel));
    expect(patched.cmdline).toContain(MOCK_CMDLINE_MARKER);
    expect(patched.headerVersion).toBe(2);
    expect(sectionOf(patched, "bootconfig")).toBeUndefined();
    expect(outcome.result.metadata.manifestKind).toBe("cmdline");
  });

  it("produces a stable plan id for identical inputs", async () => {
    const bytes = await buildBootImage({});
    const analyzed = await engine.analyze(bytes);
    const first = await engine.plan({
      image: analyzed.image,
      sourceImageSha256: analyzed.sha256,
      providerId: "mock",
      options: {},
    });
    const second = await engine.plan({
      image: analyzed.image,
      sourceImageSha256: analyzed.sha256,
      providerId: "mock",
      options: {},
    });
    expect(first.id).toBe(second.id);
    expect(first.id).toHaveLength(32);
    expect(first.reproducible).toBe(true);
  });

  it("rejects a planned provider with a structured error", async () => {
    const bytes = await buildBootImage({});
    const analyzed = await engine.analyze(bytes);
    await expect(
      engine.plan({ image: analyzed.image, sourceImageSha256: analyzed.sha256, providerId: "magisk", options: {} }),
    ).rejects.toThrowError(/not implemented yet/i);
  });

  it("rejects vendor_boot images for the mock provider pipeline", async () => {
    const bytes = await buildVendorBootImage({});
    const analyzed = await engine.analyze(bytes);
    const mock = analyzed.compatibility.candidates.find((entry) => entry.providerId === "mock");
    expect(mock?.compatible).toBe(false);
    await expect(
      engine.plan({ image: analyzed.image, sourceImageSha256: analyzed.sha256, providerId: "mock", options: {} }),
    ).rejects.toThrowError();
  });

  it("keeps the produced image parseable and page aligned", async () => {
    const bytes = await buildBootImage({ signatureSize: 1024 });
    const analyzed = await engine.analyze(bytes);
    const outcome = await engine.run(analyzed.image, analyzed.sha256, "mock", {});
    const patched = assertBootImage(parseImage(outcome.result.bytes));
    expect(patched.header.signatureSize).toBe(0);
    expect(outcome.result.bytes.length % patched.pageSize).toBe(0);
    expect(outcome.result.warnings.join(" ")).toMatch(/AVB signature was dropped/);
  });
});
