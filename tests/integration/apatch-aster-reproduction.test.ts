import { describe, expect, it } from "vitest";
import { APATCH_KPIMG_ASTER_SHA256, ARTIFACT_CATALOG, createArtifactRegistry, createPatchEngine } from "@/core";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { sha256Hex } from "@/core/hash";
import { buildBootImage } from "../fixtures/bootimg";
import {
  ASTER_DUMP_PATH,
  STOCK_IMAGE_PATH,
  fsPayloadLoader,
  hasAsterReproductionMaterial,
  readAsterDump,
  readStockImage,
} from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;

/**
 * The strongest check available without a device: a boot partition dumped from a phone
 * that was flashed with the Aster KernelPatch build must be reproducible byte for byte
 * from the stock image with the bundled Aster core image.
 */
describe.skipIf(!hasAsterReproductionMaterial)("Aster flavour against a flashed device dump", () => {
  it("reproduces the flashed kernel byte for byte", async () => {
    const stock = assertBootImage(parseImage(readStockImage()));
    const stockKernel = sectionOf(stock, "kernel")?.data ?? new Uint8Array();
    const dump = assertBootImage(parseImage(readAsterDump()));
    const flashedKernel = sectionOf(dump, "kernel")?.data ?? new Uint8Array();

    expect(stockKernel.length).toBeGreaterThan(0);
    expect(flashedKernel.length).toBeGreaterThan(stockKernel.length);

    const analyzed = await engine.analyze(await buildBootImage({ kernel: stockKernel }));
    const outcome = await engine.run(analyzed.image, analyzed.sha256, "apatch", {
      configuration: { kernelPatchFlavor: "aster" },
    });

    expect(outcome.plan.artifact.sha256).toBe(APATCH_KPIMG_ASTER_SHA256);
    expect(outcome.result.metadata.requiredManager).toBe("me.yuki.aster");

    const patched = assertBootImage(parseImage(outcome.result.bytes));
    const patchedKernel = sectionOf(patched, "kernel")?.data ?? new Uint8Array();

    expect(patchedKernel.length).toBe(flashedKernel.length);
    expect(await sha256Hex(patchedKernel)).toBe(await sha256Hex(flashedKernel));
  }, TIMEOUT);

  it("reports which material the reproduction uses", () => {
    expect(STOCK_IMAGE_PATH).toContain("boot");
    expect(ASTER_DUMP_PATH).toContain("boot");
  });
});
