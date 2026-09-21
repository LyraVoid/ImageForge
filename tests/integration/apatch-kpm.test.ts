import { describe, expect, it } from "vitest";
import { APATCH_KPM_SETTING, ARTIFACT_CATALOG, createArtifactRegistry, createPatchEngine } from "@/core";
import { PatchError } from "@/core/errors";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { buildKpm } from "../fixtures/kpm";
import { fsPayloadLoader, hasRealImage, readRealImage } from "../fixtures/artifacts";
import { APATCH_KPTOOLS_ID } from "@/core";
import { compileWasiModule, runWasiTool } from "@/wasm/wasi-runner";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;
const MODULE_NAME = "imageforge-demo.kpm";

async function kptoolsList(kernel: Uint8Array): Promise<string[]> {
  const artifact = artifacts.resolve({ providerId: "apatch", artifactId: APATCH_KPTOOLS_ID }).artifact;
  const wasm = await artifacts.loadVerifiedPayload(artifact);
  const module = await compileWasiModule("kpm-test-kptools", wasm);
  const result = await runWasiTool({ module, args: ["-l", "-i", "/kernel"], files: { kernel } });
  return result.stdout;
}

describe.skipIf(!hasRealImage)("APatch KernelPatch module embedding", () => {
  it(
    "embeds a module, reports it and keeps it out of the plan",
    async () => {
      const analyzed = await engine.analyze(readRealImage());
      const kpm = buildKpm({ name: "imageforge-demo", version: "1.2.3", author: "ImageForge" });
      const options = { configuration: { [APATCH_KPM_SETTING]: MODULE_NAME } };

      const provider = engine.providers.get("apatch");
      const plan = await provider?.resolve(analyzed.image, options, analyzed.sha256);
      expect(plan?.configuration.kpmModules).toBe(MODULE_NAME);
      expect(plan?.notes.join(" ")).toMatch(/1 KernelPatch module\(s\) will be embedded/);

      const plain = await engine.run(analyzed.image, analyzed.sha256, "apatch", {});
      const withModule = await engine.run(analyzed.image, analyzed.sha256, "apatch", options, {
        attachments: [{ id: MODULE_NAME, name: MODULE_NAME, bytes: kpm }],
      });

      expect(withModule.result.metadata.kpmCount).toBe("1");
      expect(withModule.result.metadata.kpmModules).toContain("imageforge-demo 1.2.3 [GPL] by ImageForge");
      expect(withModule.result.metadata.kpmModules).toContain(MODULE_NAME);
      expect(withModule.result.metadata.kpmModules).toMatch(/sha256 [0-9a-f]{16}/);
      expect(withModule.result.metadata.kpmModules).not.toContain("description=");
      expect(withModule.verification.verification.valid).toBe(true);

      const plainKernel = sectionOf(assertBootImage(parseImage(plain.result.bytes)), "kernel")?.data ?? new Uint8Array();
      const moduleKernel =
        sectionOf(assertBootImage(parseImage(withModule.result.bytes)), "kernel")?.data ?? new Uint8Array();
      expect(moduleKernel.length).toBeGreaterThan(plainKernel.length);
      expect(moduleKernel.length - plainKernel.length).toBeGreaterThanOrEqual(kpm.length);

      const listing = await kptoolsList(moduleKernel);
      expect(listing.join("\n")).toMatch(/num=1/);
      expect(listing.join("\n")).toContain("imageforge-demo");
      expect(listing.join("\n")).toContain("1.2.3");
    },
    TIMEOUT,
  );

  it(
    "refuses a module the plan does not pin",
    async () => {
      const analyzed = await engine.analyze(readRealImage());
      const kpm = buildKpm();

      await expect(
        engine.run(analyzed.image, analyzed.sha256, "apatch", {}, {
          attachments: [{ id: MODULE_NAME, name: MODULE_NAME, bytes: kpm }],
        }),
      ).rejects.toThrowError(PatchError);
    },
    TIMEOUT,
  );

  it("builds a module fixture the KernelPatch ELF checks accept", () => {
    const kpm = buildKpm({ name: "check" });
    expect(kpm.length).toBeGreaterThan(64);
    expect(Array.from(kpm.subarray(0, 4))).toEqual([0x7f, 0x45, 0x4c, 0x46]);
    expect(new DataView(kpm.buffer).getUint16(18, true)).toBe(183);
    expect(new TextDecoder().decode(kpm)).toContain(".kpm.info");
  });
});
