import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APATCH_KPM_SETTING,
  APATCH_KPTOOLS_ID,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
  readKpmInfo,
} from "@/core";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { compileWasiModule, runWasiTool } from "@/wasm/wasi-runner";
import { REAL_KPM_PATH, fsPayloadLoader, hasRealImage, hasRealKpm, readRealImage } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;

async function kptoolsList(kernel: Uint8Array): Promise<string[]> {
  const artifact = artifacts.resolve({ providerId: "apatch", artifactId: APATCH_KPTOOLS_ID }).artifact;
  const wasm = await artifacts.loadVerifiedPayload(artifact);
  const module = await compileWasiModule("real-kpm-kptools", wasm);
  const result = await runWasiTool({ module, args: ["-l", "-i", "/kernel"], files: { kernel } });
  return result.stdout;
}

describe.skipIf(!hasRealKpm || !hasRealImage)("APatch with a real third-party module", () => {
  it(
    "embeds it and reports the identity it declares, including its licence",
    async () => {
      const path = REAL_KPM_PATH as string;
      const name = basename(path);
      const bytes = new Uint8Array(readFileSync(path));
      const declared = readKpmInfo(bytes);
      expect(declared.name).toBeTruthy();

      const analyzed = await engine.analyze(readRealImage());
      const outcome = await engine.run(
        analyzed.image,
        analyzed.sha256,
        "apatch",
        { configuration: { [APATCH_KPM_SETTING]: name } },
        { attachments: [{ id: name, name, bytes }] },
      );

      expect(outcome.result.metadata.kpmCount).toBe("1");
      expect(outcome.result.metadata.kpmModules).toContain(String(declared.name));
      expect(outcome.result.metadata.kpmModules).toContain(name);
      if (declared.license) {
        expect(outcome.result.metadata.kpmModules).toContain("[" + declared.license + "]");
      }
      expect(outcome.verification.verification.valid).toBe(true);

      const patched = assertBootImage(parseImage(outcome.result.bytes));
      const kernel = sectionOf(patched, "kernel")?.data ?? new Uint8Array();
      const listing = (await kptoolsList(kernel)).join("\n");
      expect(listing).toMatch(/num=1/);
      expect(listing).toContain(String(declared.name));
      if (declared.version) expect(listing).toContain(String(declared.version));
    },
    TIMEOUT,
  );
});
