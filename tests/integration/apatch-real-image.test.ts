import { describe, expect, it } from "vitest";
import {
  APATCH_KPIMG_SHA256,
  APATCH_KPTOOLS_ID,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
} from "@/core";
import { assertBootImage, detectCompression, parseImage, sectionOf } from "@/core/image";
import { decodeLz4, encodeLz4 } from "@/core/image/lz4";
import { sha256Hex } from "@/core/hash";
import { compileWasiModule, runWasiTool } from "@/wasm/wasi-runner";
import { buildBootImage } from "../fixtures/bootimg";
import { REAL_IMAGE_PATH, fsPayloadLoader, hasRealImage, readRealImage } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;

async function kptoolsList(kernel: Uint8Array): Promise<string[]> {
  const artifact = artifacts.resolve({ providerId: "apatch", artifactId: APATCH_KPTOOLS_ID }).artifact;
  const wasm = await artifacts.loadVerifiedPayload(artifact);
  const module = await compileWasiModule("real-image-kptools", wasm);
  const result = await runWasiTool({ module, args: ["-l", "-i", "/kernel"], files: { kernel } });
  return result.stdout;
}

describe.skipIf(!hasRealImage)("APatch against a real GKI boot image", () => {
  it(
    "analyzes the real image and offers APatch as a compatible candidate",
    async () => {
      const analyzed = await engine.analyze(readRealImage());
      const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "apatch");

      expect(analyzed.image.format).toBe("boot");
      expect(analyzed.image.architecture).toBe("arm64");
      expect(candidate?.available).toBe(true);
      expect(candidate?.compatible).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "plans, injects KernelPatch into the kernel and verifies the produced image",
    async () => {
      const analyzed = await engine.analyze(readRealImage());
      const provider = engine.providers.get("apatch");
      expect(provider).toBeDefined();

      const plan = await provider?.resolve(analyzed.image, {}, analyzed.sha256);
      expect(plan?.target).toBe("boot");
      expect(plan?.configuration.kallsyms).toBe("enabled");
      expect(plan?.configuration.superkeyMode).toBe("none");
      expect(plan?.configuration.kptoolsVersion).toBe("0.13.8");
      expect(plan?.configuration.kpimgVersion).toMatch(/^0x[0-9a-f]+$/);

      const outcome = await engine.run(analyzed.image, analyzed.sha256, "apatch", {});

      expect(outcome.result.metadata.kptoolsConfirmation).toBe("patched=true");
      expect(outcome.result.metadata.superkeyMode).toBe("none");
      expect(outcome.result.metadata.artifactSha256).toBe(APATCH_KPIMG_SHA256);
      expect(Number(outcome.result.metadata.kernelSizeAfter)).toBeGreaterThan(
        Number(outcome.result.metadata.kernelSizeBefore),
      );
      expect(outcome.verification.verification.valid).toBe(true);

      const patched = assertBootImage(parseImage(outcome.result.bytes));
      const kernel = sectionOf(patched, "kernel");
      expect(kernel).toBeDefined();
      expect(await sha256Hex(kernel?.data ?? new Uint8Array())).toBe(outcome.result.metadata.kernelSha256);
      expect(patched.header.kernelSize).toBe(Number(outcome.result.metadata.kernelSizeAfter));
    },
    TIMEOUT,
  );

  it(
    "patches a kernel that is LZ4 compressed and writes the same container back",
    async () => {
      const original = assertBootImage(parseImage(readRealImage()));
      const rawKernel = sectionOf(original, "kernel")?.data ?? new Uint8Array();
      expect(rawKernel.length).toBeGreaterThan(0);

      const compressed = await encodeLz4(rawKernel, { kind: "lz4-legacy", blockMaxSize: 8 * 1024 * 1024 });
      const bytes = await buildBootImage({ kernel: compressed, headerVersion: 4 });
      const analyzed = await engine.analyze(bytes);
      const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "apatch");
      expect(candidate?.compatible).toBe(true);

      const outcome = await engine.run(analyzed.image, analyzed.sha256, "apatch", {});
      expect(outcome.result.metadata.kernelCompression).toBe("LZ4 (legacy)");
      expect(outcome.verification.verification.valid).toBe(true);

      const patched = assertBootImage(parseImage(outcome.result.bytes));
      const patchedSection = sectionOf(patched, "kernel")?.data ?? new Uint8Array();
      expect(detectCompression(patchedSection)).toBe("lz4-legacy");
      expect(patched.header.kernelSize).toBe(patchedSection.length);

      // independent confirmation: expand the produced section and ask kptools about it
      const decoded = await decodeLz4(patchedSection);
      const confirmation = await kptoolsList(decoded);
      expect(confirmation.some((line) => line.includes("patched=true"))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "can keep the original partition image size",
    async () => {
      const bytes = readRealImage();
      const analyzed = await engine.analyze(bytes);
      const outcome = await engine.run(analyzed.image, analyzed.sha256, "apatch", {
        configuration: { preserveImageSize: "true" },
      });

      expect(outcome.result.bytes.length).toBe(bytes.length);
      expect(outcome.result.metadata.preserveImageSize).toBe("true");
      expect(outcome.result.warnings.join(" ")).toMatch(/zero padded/);
    },
    TIMEOUT,
  );

  it(
    "produces the same patched kernel on a second run",
    async () => {
      const analyzed = await engine.analyze(readRealImage());
      const first = await engine.run(analyzed.image, analyzed.sha256, "apatch", {});
      const second = await engine.run(analyzed.image, analyzed.sha256, "apatch", {});

      expect(first.result.metadata.kernelSha256).toBe(second.result.metadata.kernelSha256);
    },
    TIMEOUT,
  );

  it("reports which image the real-image tests use", () => {
    expect(REAL_IMAGE_PATH).toMatch(/boot.*\.img$/);
  });
});
