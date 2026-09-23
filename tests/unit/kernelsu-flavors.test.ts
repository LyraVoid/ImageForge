import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CATALOG,
  KERNELSU_DEFAULT_FLAVOR,
  KERNELSU_FLAVORS,
  KNOWN_KMIS,
  createArtifactRegistry,
  kernelsuFlavor,
} from "@/core";
import { injectYukisuModuleConfig } from "@/core/patch/providers/kernelsu-module-config";
import { sha256Hex } from "@/core/hash";
import { readModuleInfo } from "@/core/image";
import { fsPayloadLoader } from "../fixtures/artifacts";

const registry = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);

/**
 * Each manager of the KernelSU family compiles its modules against its own signing certificate, so a
 * module from one manager does not work with another's app. That makes the pairing a correctness
 * property rather than a preference: every flavour has to resolve a wrapper, its own module for every
 * KMI, and name the app that trusts them.
 */
describe("KernelSU family flavours", () => {
  it("resolves a wrapper and a module for every KMI, per manager", async () => {
    expect(KERNELSU_DEFAULT_FLAVOR).toBe("kernelsu");
    expect(KERNELSU_FLAVORS.map((flavor) => flavor.id)).toEqual([
      "kernelsu",
      "sukisu",
      "resukisu",
      "yukisu",
      "kowsu",
    ]);

    const wrappers = new Set<string>();
    const modules = new Set<string>();
    for (const flavor of KERNELSU_FLAVORS) {
      const wrapper = registry.resolve({ providerId: "kernelsu", artifactId: flavor.ksuinitArtifactId }).artifact;
      expect(wrapper.type, flavor.id).toBe("init-wrapper");
      expect(wrapper.sha256, flavor.id).toBeDefined();
      wrappers.add(flavor.ksuinitArtifactId);

      for (const kmi of KNOWN_KMIS) {
        const module = registry.resolve({ providerId: "kernelsu", artifactId: flavor.lkmArtifactId(kmi) }).artifact;
        expect(module.sha256, flavor.id + " " + kmi).toBeDefined();
        modules.add(module.id);
        // The module has to be a kernel module of this family, and built for the KMI it is filed under.
        const info = readModuleInfo(await registry.loadVerifiedPayload(module));
        expect(info.name, flavor.id + " " + kmi).toBe("kernelsu");
        expect(info.vermagic?.split(" ")[0], flavor.id + " " + kmi).toMatch(/^\d+\.\d+/);
        await expect(sha256Hex(await registry.loadVerifiedPayload(module))).resolves.toBe(module.sha256);
      }
    }

    expect(wrappers.size).toBe(KERNELSU_FLAVORS.length);
    expect(modules.size).toBe(KERNELSU_FLAVORS.length * KNOWN_KMIS.length);
  });

  it("names a distinct manager for every flavour, and a flavour for every manager", () => {
    const packages = KERNELSU_FLAVORS.map((flavor) => flavor.managerPackage);
    expect(new Set(packages).size).toBe(packages.length);
    expect(kernelsuFlavor(undefined).id).toBe("kernelsu");
    expect(kernelsuFlavor("nope").id).toBe("kernelsu");
    for (const flavor of KERNELSU_FLAVORS) expect(kernelsuFlavor(flavor.id).id).toBe(flavor.id);
  });
});

/**
 * YukiSU is the one manager that also stores its settings inside the module. The released modules
 * already carry those blocks, so the job is to write the same values its patcher would — and to leave
 * every other byte alone, which is what makes the produced module traceable to its release.
 */
describe("YukiSU module settings", () => {
  const IMGPATCH_MAGIC = 0x314746434955534bn;

  function configBlock(bytes: Uint8Array): number {
    for (let offset = 0; offset + 512 <= bytes.length; offset += 1) {
      if (new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true) === IMGPATCH_MAGIC) {
        return offset;
      }
    }
    return -1;
  }

  it("writes the flags the patcher writes and nothing else", async () => {
    const flavor = kernelsuFlavor("yukisu");
    const artifact = registry.resolve({
      providerId: "kernelsu",
      artifactId: flavor.lkmArtifactId("android15-6.6"),
    }).artifact;
    const released = await registry.loadVerifiedPayload(artifact);

    const block = configBlock(released);
    expect(block, "the released module carries the imgpatch config block").toBeGreaterThan(0);
    const view = new DataView(released.buffer, released.byteOffset + block, 512);
    expect(view.getUint32(8, true)).toBe(1); // version
    expect(view.getUint32(12, true)).toBe(512); // size

    const bundled = injectYukisuModuleConfig(released, { allowShell: false, bundled: true });
    const bundledView = new DataView(bundled.buffer, bundled.byteOffset + block, 512);
    expect(bundledView.getBigUint64(16, true)).toBe(1n << 3n); // BUNDLED

    const withShell = injectYukisuModuleConfig(released, { allowShell: true, bundled: true });
    const shellView = new DataView(withShell.buffer, withShell.byteOffset + block, 512);
    expect(shellView.getBigUint64(16, true)).toBe((1n << 3n) | 1n); // BUNDLED | ALLOW_SHELL

    // Only the block's flags, and the fields the patcher zeroes, may differ.
    let differing = 0;
    for (let index = 0; index < released.length; index += 1) {
      if (released[index] !== bundled[index]) {
        differing += 1;
        expect(index, "a difference outside the config block").toBeGreaterThanOrEqual(block);
        expect(index, "a difference inside the immutable head of the block").toBeLessThan(block + 24);
        expect(index, "a difference outside the flags word").toBeLessThan(block + 24);
      }
    }
    expect(differing).toBeLessThanOrEqual(8);
    // The released file is never modified: the copy is what goes to the ramdisk.
    expect(configBlock(released)).toBe(block);
  });

  it("refuses a module that does not carry the block YukiSU writes", () => {
    expect(() => injectYukisuModuleConfig(new Uint8Array(1024), { allowShell: false, bundled: true })).toThrowError(
      /Use the module from the manager/,
    );
  });
});
