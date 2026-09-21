import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
  KERNELSU_KMI_SETTING,
  KERNELSU_MODULE_ENTRY,
  KERNELSU_REQUIRED_MANAGER,
} from "@/core";
import { assertBootImage, buildImageReport, decodeRamdisk, findEntry, parseImage, sectionOf } from "@/core/image";
import { sha256Hex } from "@/core/hash";
import {
  fsPayloadLoader,
  hasInitBootImage,
  hasKernelsuModule,
  readInitBootImage,
  readKernelsuModule,
} from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;
const KMI = "android15-6.6";

async function archiveOf(imageBytes: Uint8Array) {
  const image = assertBootImage(parseImage(imageBytes));
  const section = sectionOf(image, "ramdisk");
  if (!section) throw new Error("no ramdisk section");
  return (await decodeRamdisk(section.data)).archive;
}

/**
 * Acceptance test for the KernelSU provider against a real device init_boot image and a real
 * KernelSU module: the stock init has to survive as init.real, the wrapper has to take its place,
 * and the module has to end up in the ramdisk byte for byte.
 */
describe.skipIf(!hasInitBootImage || !hasKernelsuModule)("KernelSU provider against real material", () => {
  it(
    "installs KernelSU into a real init_boot image",
    async () => {
      const source = readInitBootImage();
      const module = readKernelsuModule();
      const stock = await archiveOf(source);
      const stockInit = findEntry(stock, "init");
      expect(stockInit).toBeDefined();

      const analyzed = await engine.analyze(source);
      expect(analyzed.image.format).toBe("init_boot");

      const outcome = await engine.run(
        analyzed.image,
        analyzed.sha256,
        "kernelsu",
        { configuration: { [KERNELSU_KMI_SETTING]: KMI } },
        { attachments: [{ id: "kernelsu.ko", name: "kernelsu.ko", bytes: module }] },
      );

      expect(outcome.verification.verification.valid).toBe(true);
      expect(outcome.result.metadata.kmi).toBe(KMI);
      expect(outcome.result.metadata.kmiSource).toMatch(/^selected/);
      expect(outcome.result.metadata.moduleDeclaredName).toBe("kernelsu");
      expect(outcome.result.metadata.moduleLicense).toBe("GPL");
      expect(outcome.result.metadata.moduleVermagic).toContain("6.6.127");
      expect(outcome.result.metadata.requiredManager).toBe(KERNELSU_REQUIRED_MANAGER);

      const archive = await archiveOf(outcome.result.bytes);
      const init = findEntry(archive, "init");
      const backup = findEntry(archive, "init.real");
      const embedded = findEntry(archive, KERNELSU_MODULE_ENTRY);
      if (!init || !backup || !embedded || !stockInit) throw new Error("the produced ramdisk is missing entries");

      // the stock init survived unchanged, the wrapper took its place, the module is embedded
      expect(await sha256Hex(backup.data)).toBe(await sha256Hex(stockInit.data));
      expect(await sha256Hex(embedded.data)).toBe(await sha256Hex(module));
      expect(init.mode & 0o777).toBe(0o755);
      expect(embedded.mode & 0o777).toBe(0o755);
      expect(init.data.length).toBeGreaterThan(100000);

      // every other entry is still there
      for (const entry of stock.entries) {
        const name = entry.name === "init" ? "init.real" : entry.name;
        expect(findEntry(archive, name)).toBeDefined();
      }

      // the produced image is recognised as already patched when it is analysed again
      const reanalyzed = await engine.analyze(outcome.result.bytes);
      const report = await buildImageReport(reanalyzed.image, { sourceName: "produced.img" });
      expect(report.existingPatch?.join(" ")).toMatch(/KernelSU: kernelsu.ko/);
      // init keeps its entry (renamed), a new init and the module are added
      expect(archive.entries.length).toBe(stock.entries.length + 2);
    },
    TIMEOUT,
  );
});
