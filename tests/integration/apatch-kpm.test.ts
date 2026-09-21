import { describe, expect, it } from "vitest";
import {
  APATCH_KPM_SETTING,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
  readKpmInfo,
} from "@/core";
import { PatchError } from "@/core/errors";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { buildKpm } from "../fixtures/kpm";
import { fsPayloadLoader, hasRealImage, readDemoKpm, readRealImage } from "../fixtures/artifacts";
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
      // A real module from the KernelPatch-Aster 0.13.8 release rather than a synthetic one.
      const kpm = readDemoKpm();
      const declared = readKpmInfo(kpm);
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
      expect(declared.name).toBeTruthy();
      expect(withModule.result.metadata.kpmModules).toContain(String(declared.name));
      expect(withModule.result.metadata.kpmModules).toContain(MODULE_NAME);
      expect(withModule.result.metadata.kpmModules).toMatch(/sha256 [0-9a-f]{16}/);
      expect(withModule.result.metadata.kpmModules).not.toContain("description=");
      expect(withModule.verification.verification.valid).toBe(true);

      const plainKernel = sectionOf(assertBootImage(parseImage(plain.result.bytes)), "kernel")?.data ?? new Uint8Array();
      const moduleKernel =
        sectionOf(assertBootImage(parseImage(withModule.result.bytes)), "kernel")?.data ?? new Uint8Array();
      expect(moduleKernel.length).toBeGreaterThan(plainKernel.length);
      expect(moduleKernel.length - plainKernel.length).toBeGreaterThanOrEqual(kpm.length);

      const listing = (await kptoolsList(moduleKernel)).join("\n");
      expect(listing).toMatch(/num=1/);
      expect(listing).toContain(String(declared.name));
      if (declared.version) expect(listing).toContain(String(declared.version));
    },
    TIMEOUT,
  );

  it(
    "pins the modules the run carries even when the options do not list them",
    async () => {
      // This is the shape that used to fail: the caller carries a module but the options never
      // mention it. The plan has to end up pinning it.
      const analyzed = await engine.analyze(readRealImage());
      const kpm = buildKpm({ name: "carried-only" });

      const outcome = await engine.run(analyzed.image, analyzed.sha256, "apatch", {}, {
        attachments: [{ id: MODULE_NAME, name: MODULE_NAME, bytes: kpm }],
      });

      expect(outcome.plan.configuration.kpmModules).toBe(MODULE_NAME);
      expect(outcome.result.metadata.kpmCount).toBe("1");
      expect(outcome.verification.verification.valid).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "still refuses a module that is patched with a plan which does not pin it",
    async () => {
      const analyzed = await engine.analyze(readRealImage());
      const provider = engine.providers.get("apatch");
      const kpm = buildKpm();

      const plan = await provider?.resolve(analyzed.image, {}, analyzed.sha256);
      expect(plan).toBeDefined();
      if (!plan || !provider) throw new Error("no plan");

      await expect(
        provider.patch(analyzed.image, plan, {
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
