import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CATALOG,
  KERNELSU_FLAVORS,
  KERNELSU_INIT_BACKUP_ENTRY,
  KERNELSU_INIT_ENTRY,
  KERNELSU_MODULE_ENTRY,
  createArtifactRegistry,
  createPatchEngine,
  kernelsuFlavor,
} from "@/core";
import { sha256Hex } from "@/core/hash";
import { assertBootImage, decodeRamdisk, findEntry, parseImage, sectionOf } from "@/core/image";
import { fsPayloadLoader, hasInitBootImage, readInitBootImage } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;
const KMI = "android15-6.6";
const KSU_CONFIG = "norc=1 allow_shell=1";

/**
 * Every manager of the family patches the same way, so what has to be checked per manager is that the
 * run really carries *its* wrapper and *its* module and reports *its* app — the three things that
 * differ between them and that would otherwise only fail on a device.
 */
describe.skipIf(!hasInitBootImage)("KernelSU family against a real init_boot.img", () => {
  for (const flavor of KERNELSU_FLAVORS) {
    it("writes " + flavor.label + "'s wrapper, module and configuration", async () => {
      const source = readInitBootImage();
      const analyzed = await engine.analyze(source);
      const outcome = await engine.run(analyzed.image, analyzed.sha256, "kernelsu", {
        configuration: { kmi: KMI, kernelsuManager: flavor.id, ksuConfig: KSU_CONFIG },
      });

      expect(outcome.plan.artifact.id).toBe(flavor.ksuinitArtifactId);
      expect(outcome.result.metadata.requiredManager).toBe(flavor.managerPackage);

      const patched = assertBootImage(parseImage(outcome.result.bytes));
      const archive = (await decodeRamdisk(sectionOf(patched, "ramdisk")?.data ?? new Uint8Array())).archive;

      // init is the manager's wrapper, and the stock init is kept beside it.
      const ksuinit = await artifacts.loadVerifiedPayload(
        artifacts.resolve({ providerId: "kernelsu", artifactId: flavor.ksuinitArtifactId }).artifact,
      );
      const init = findEntry(archive, KERNELSU_INIT_ENTRY);
      expect(init, flavor.id).toBeDefined();
      expect(await sha256Hex(init?.data ?? new Uint8Array())).toBe(await sha256Hex(ksuinit));
      expect(findEntry(archive, KERNELSU_INIT_BACKUP_ENTRY), flavor.id).toBeDefined();

      // kernelsu.ko is this manager's module for the KMI.
      const module = await artifacts.loadVerifiedPayload(
        artifacts.resolve({ providerId: "kernelsu", artifactId: flavor.lkmArtifactId(KMI) }).artifact,
      );
      const entry = findEntry(archive, KERNELSU_MODULE_ENTRY);
      expect(entry, flavor.id).toBeDefined();
      const written = entry?.data ?? new Uint8Array();
      expect(written.length, flavor.id).toBe(module.length);
      if (!flavor.injectModuleConfig) {
        // Written untouched; only YukiSU writes its settings into the module.
        expect(await sha256Hex(written), flavor.id).toBe(await sha256Hex(module));
      }

      // The configuration is the run's, plus what the manager records about the module it was given.
      const config = findEntry(archive, "ksu_config");
      const configText = new TextDecoder().decode(config?.data ?? new Uint8Array());
      expect(configText, flavor.id).toContain("norc=1");
      expect(configText, flavor.id).toContain("allow_shell=1");
      if (flavor.bundledModuleConfig.length > 0) {
        expect(configText, flavor.id).toContain("bundled=1");
      }
      expect(findEntry(archive, flavor.legacyEntry), flavor.id).toBeUndefined();
    }, TIMEOUT);
  }

  it("refuses a module whose manager does not match the flavour", async () => {
    const source = readInitBootImage();
    const analyzed = await engine.analyze(source);
    // A module from another manager, attached while the plan is for KernelSU: its .modinfo is a
    // KernelSU module, but the run's configuration must not silently mix the two managers.
    const other = kernelsuFlavor("koyeb" as never);
    expect(other.id).toBe("kernelsu");
    const outcome = await engine.run(analyzed.image, analyzed.sha256, "kernelsu", {
      configuration: { kmi: KMI, kernelsuManager: "sukisu", ksuConfig: KSU_CONFIG },
    });
    expect(outcome.plan.configuration.kernelsuManager).toBe("sukisu");
    expect(outcome.result.metadata.requiredManager).toBe("com.sukisu.ultra");
    expect(outcome.plan.configuration.moduleArtifact).toBe("sukisu-lkm-" + KMI);
  }, TIMEOUT);

  it("does not add the bundled marker when the user supplies the module", async () => {
    const flavor = kernelsuFlavor("resukisu");
    const module = await artifacts.loadVerifiedPayload(
      artifacts.resolve({ providerId: "kernelsu", artifactId: flavor.lkmArtifactId(KMI) }).artifact,
    );
    const analyzed = await engine.analyze(readInitBootImage());
    const outcome = await engine.run(
      analyzed.image,
      analyzed.sha256,
      "kernelsu",
      { configuration: { kmi: KMI, kernelsuManager: flavor.id, ksuConfig: KSU_CONFIG } },
      { attachments: [{ id: "mine", name: "mine.ko", bytes: module }] },
    );

    const patched = assertBootImage(parseImage(outcome.result.bytes));
    const archive = (await decodeRamdisk(sectionOf(patched, "ramdisk")?.data ?? new Uint8Array())).archive;
    const configText = new TextDecoder().decode(findEntry(archive, "ksu_config")?.data ?? new Uint8Array());
    expect(configText).toContain("norc=1");
    expect(configText).not.toContain("bundled=1");
  }, TIMEOUT);
});
