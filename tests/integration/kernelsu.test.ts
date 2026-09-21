import { describe, expect, it } from "vitest";
import {
  KERNELSU_INIT_BACKUP_ENTRY,
  KERNELSU_INIT_ENTRY,
  KERNELSU_KMI_SETTING,
  KERNELSU_MODULE_ENTRY,
  KERNELSU_REQUIRED_MANAGER,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
} from "@/core";
import { PatchError } from "@/core/errors";
import { assertBootImage, decodeRamdisk, findEntry, parseImage, sectionOf } from "@/core/image";
import { buildModuleObject } from "../fixtures/elf";
import { buildRamdisk } from "../fixtures/cpio";
import { buildBootImage } from "../fixtures/bootimg";
import { fsPayloadLoader } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;
const KMI = "android15-6.6";

const STOCK_INIT = "stock init payload\n";

function stockRamdisk(extra: Array<{ name: string; data?: string; mode?: number }> = []): Uint8Array {
  return buildRamdisk([
    { name: "init", data: STOCK_INIT, mode: 0o100750 },
    { name: "dev", mode: 0o040755, nlink: 3 },
    { name: "dev/null", mode: 0o020666 },
    ...extra,
  ]);
}

async function ramdiskOf(imageBytes: Uint8Array) {
  const image = assertBootImage(parseImage(imageBytes));
  const section = sectionOf(image, "ramdisk");
  if (!section) throw new Error("the produced image has no ramdisk");
  return (await decodeRamdisk(section.data)).archive;
}

describe("KernelSU provider", () => {
  it(
    "replaces init, keeps the original one and embeds the module",
    async () => {
      const image = await buildBootImage({ kernel: null, ramdisk: stockRamdisk() });
      const analyzed = await engine.analyze(image);
      expect(analyzed.image.format).toBe("init_boot");

      const module = buildModuleObject({ name: "kernelsu" });
      const outcome = await engine.run(
        analyzed.image,
        analyzed.sha256,
        "kernelsu",
        { configuration: { [KERNELSU_KMI_SETTING]: KMI } },
        { attachments: [{ id: "test_kernelsu.ko", name: "test_kernelsu.ko", bytes: module }] },
      );

      expect(outcome.verification.verification.valid).toBe(true);
      expect(outcome.result.metadata.kmi).toBe(KMI);
      expect(outcome.result.metadata.moduleDeclaredName).toBe("kernelsu");
      expect(outcome.result.metadata.moduleLicense).toBe("GPL");
      expect(outcome.result.metadata.moduleVermagic).toContain("6.6.127");
      expect(outcome.result.metadata.requiredManager).toBe(KERNELSU_REQUIRED_MANAGER);
      expect(outcome.result.metadata.moduleSha256).toHaveLength(64);
      expect(outcome.result.metadata.initBackup).toContain(KERNELSU_INIT_BACKUP_ENTRY);

      const archive = await ramdiskOf(outcome.result.bytes);
      const init = findEntry(archive, KERNELSU_INIT_ENTRY);
      const backup = findEntry(archive, KERNELSU_INIT_BACKUP_ENTRY);
      const embedded = findEntry(archive, KERNELSU_MODULE_ENTRY);

      if (!init || !backup || !embedded) throw new Error("the produced ramdisk is missing entries");
      expect(new TextDecoder().decode(backup.data)).toBe(STOCK_INIT);
      expect(init.mode & 0o777).toBe(0o755);
      expect(init.data.length).toBeGreaterThan(100000);
      expect(embedded.mode & 0o777).toBe(0o755);
      expect(embedded.data.length).toBe(module.length);
      expect(findEntry(archive, "dev/null")).toBeDefined();
    },
    TIMEOUT,
  );

  it(
    "refuses a ramdisk that Magisk already patched",
    async () => {
      const image = await buildBootImage({
        kernel: null,
        ramdisk: stockRamdisk([{ name: "overlay.d/sbin/magisk.xz", data: "magisk" }]),
      });
      const analyzed = await engine.analyze(image);

      await expect(
        engine.run(
          analyzed.image,
          analyzed.sha256,
          "kernelsu",
          { configuration: { [KERNELSU_KMI_SETTING]: KMI } },
          {
            attachments: [
              { id: "m.ko", name: "m.ko", bytes: buildModuleObject({ name: "kernelsu" }) },
            ],
          },
        ),
      ).rejects.toThrowError(PatchError);
    },
    TIMEOUT,
  );

  it(
    "refuses a module built for another kernel version than the selected KMI",
    async () => {
      const image = await buildBootImage({ kernel: null, ramdisk: stockRamdisk() });
      const analyzed = await engine.analyze(image);
      const wrongKernel = buildModuleObject({
        name: "kernelsu",
        vermagic: "6.1.75-android14-11-g000000000000-ab12345678 SMP preempt mod_unload modversions aarch64",
      });

      await expect(
        engine.run(
          analyzed.image,
          analyzed.sha256,
          "kernelsu",
          { configuration: { [KERNELSU_KMI_SETTING]: KMI } },
          { attachments: [{ id: "m.ko", name: "m.ko", bytes: wrongKernel }] },
        ),
      ).rejects.toThrowError(PatchError);
    },
    TIMEOUT,
  );

  it(
    "requires a KMI when the image carries no kernel",
    async () => {
      const image = await buildBootImage({ kernel: null, ramdisk: stockRamdisk() });
      const analyzed = await engine.analyze(image);

      await expect(
        engine.providers.get("kernelsu")?.resolve(analyzed.image, {}, analyzed.sha256),
      ).rejects.toThrowError(/KMI/);
    },
    TIMEOUT,
  );

  it("is offered as a candidate for an init_boot image with a ramdisk", async () => {
    const analyzed = await engine.analyze(await buildBootImage({ kernel: null, ramdisk: stockRamdisk() }));
    const candidate = analyzed.compatibility.candidates.find((entry) => entry.providerId === "kernelsu");
    expect(candidate?.compatible).toBe(true);
  });
});
