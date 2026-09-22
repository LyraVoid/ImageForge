import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APATCH_CUSTOM_FLAVOR,
  APATCH_FLAVOR_SETTING,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
} from "@/core";
import { sha256Hex } from "@/core/hash";
import { buildBootImage } from "../fixtures/bootimg";
import { fsPayloadLoader, hasAsterReproductionMaterial, readStockImage, repoPath } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;
const UPSTREAM_KPIMG = repoPath("public", "artifacts", "apatch", "kpimg");

/** A plan that pins a core image carried by the run instead of one from the registry. */
async function customPlan(sha256: string) {
  const analyzed = await engine.analyze(await buildBootImage({}));
  return {
    analyzed,
    plan: {
      id: "custom-plan",
      providerId: "apatch",
      providerName: "APatch",
      release: APATCH_CUSTOM_FLAVOR,
      artifact: {
        id: "custom-kpimg",
        version: "custom",
        type: "kpimg",
        source: "attachment:mine.bin",
      },
      architecture: "arm64",
      target: "boot" as const,
      headerVersion: 4,
      pageSize: 4096,
      sourceImageSha256: sha256,
      configuration: { [APATCH_FLAVOR_SETTING]: APATCH_CUSTOM_FLAVOR },
      steps: [],
      createdAt: new Date().toISOString(),
      reproducible: false,
      notes: [],
    },
  };
}

describe("a KernelPatch core image supplied with the run", () => {
  it("refuses a file that is not a KernelPatch core image", async () => {
    const { analyzed, plan } = await customPlan("0".repeat(64));

    await expect(
      engine.execute(analyzed.image, plan, {
        attachments: [{ id: "mine.bin", name: "mine.bin", bytes: new TextEncoder().encode("not a kpimg") }],
      }),
    ).rejects.toThrowError(/not a KernelPatch core image/);
  }, 60000);

  it("refuses when the run does not carry the file the plan pins", async () => {
    const { analyzed, plan } = await customPlan("0".repeat(64));

    await expect(engine.execute(analyzed.image, plan, {})).rejects.toThrowError(/does not carry it|Attach the KernelPatch core image/);
  }, 60000);
});

describe.skipIf(!hasAsterReproductionMaterial)("a custom core image against a real kernel", () => {
  it(
    "injects it and reports the digest and version it read",
    async () => {
      const bytes = new Uint8Array(readFileSync(UPSTREAM_KPIMG));
      const analyzed = await engine.analyze(readStockImage());

      const outcome = await engine.run(
        analyzed.image,
        analyzed.sha256,
        "apatch",
        { configuration: { [APATCH_FLAVOR_SETTING]: APATCH_CUSTOM_FLAVOR } },
        { attachments: [{ id: "mine-kpimg.bin", name: "mine-kpimg.bin", bytes }] },
      );

      expect(outcome.plan.artifact.source).toBe("attachment:mine-kpimg.bin");
      expect(outcome.plan.configuration.kernelPatchFlavor).toBe(APATCH_CUSTOM_FLAVOR);
      expect(outcome.plan.configuration.kernelPatchSource).toBe("attachment:mine-kpimg.bin");
      expect(outcome.plan.notes.join(" ")).toMatch(/attached core image/);

      // the result says what was actually injected, and what version kptools read from it
      expect(outcome.result.metadata.kpimgSha256).toBe(await sha256Hex(bytes));
      expect(outcome.result.metadata.kpimgSource).toBe("attachment:mine-kpimg.bin");
      expect(outcome.result.metadata.kernelPatchVersion).toMatch(/^0x[0-9a-f]+$/);
      expect(outcome.result.metadata.requiredManager).toMatch(/unknown/);
      expect(outcome.verification.verification.valid).toBe(true);
    },
    TIMEOUT,
  );
});
