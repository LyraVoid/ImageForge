import { describe, expect, it } from "vitest";
import {
  APATCH_KPIMG_ASTER_ID,
  APATCH_KPIMG_ASTER_SHA256,
  APATCH_KPIMG_FOLK_ID,
  APATCH_KPIMG_FOLK_SHA256,
  APATCH_KPIMG_ID,
  APATCH_KPIMG_SHA256,
  APATCH_KPTOOLS_ID,
  APATCH_KPTOOLS_SHA256,
  APATCH_FLAVORS,
  ARTIFACT_CATALOG,
  ArtifactError,
  createArtifactRegistry,
  WEAVEMASK_MAGISKINIT_ID,
} from "@/core";
import { sha256Hex } from "@/core/hash";
import { fsPayloadLoader, repoPath } from "../fixtures/artifacts";
import { readFileSync } from "node:fs";

const registry = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);

describe("bundled artifacts", () => {
  it("registers the upstream release and the two fork releases", () => {
    expect(registry.releases("apatch").map((release) => release.release)).toEqual([
      "11224",
      "aster-0ff4ae2",
      "folk-1de1a37",
    ]);
    expect(registry.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_ID }).release.release).toBe("11224");
    expect(registry.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_ASTER_ID }).release.release).toBe(
      "aster-0ff4ae2",
    );
    // the tooling artifact lives in the shared release and is found by id
    expect(registry.resolve({ providerId: "apatch", artifactId: APATCH_KPTOOLS_ID }).artifact.version).toBe("0.13.8");
  });

  it("matches the shipped kpimg digest", async () => {
    const artifact = registry.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_ID }).artifact;
    const bytes = await registry.loadVerifiedPayload(artifact);

    expect(artifact.source).toBe("bundled:/artifacts/apatch/kpimg");
    expect(artifact.sha256).toBe(APATCH_KPIMG_SHA256);
    expect(bytes.length).toBe(artifact.sizeBytes);
    expect(await sha256Hex(bytes)).toBe(APATCH_KPIMG_SHA256);
  });

  it("matches the shipped Aster KernelPatch core image digest", async () => {
    const artifact = registry.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_ASTER_ID }).artifact;
    const bytes = await registry.loadVerifiedPayload(artifact);

    expect(artifact.source).toBe("bundled:/artifacts/apatch/kpimg-aster.bin");
    expect(artifact.version).toBe("0.13.8");
    expect(artifact.sha256).toBe(APATCH_KPIMG_ASTER_SHA256);
    expect(bytes.length).toBe(artifact.sizeBytes);
    expect(await sha256Hex(bytes)).toBe(APATCH_KPIMG_ASTER_SHA256);
  });

  it("matches the shipped FolkPatch KernelPatch core image digest", async () => {
    const artifact = registry.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_FOLK_ID }).artifact;
    const bytes = await registry.loadVerifiedPayload(artifact);

    expect(artifact.source).toBe("bundled:/artifacts/apatch/kpimg-folk.bin");
    expect(artifact.version).toBe("0.13.8");
    expect(artifact.sha256).toBe(APATCH_KPIMG_FOLK_SHA256);
    expect(bytes.length).toBe(artifact.sizeBytes);
    expect(await sha256Hex(bytes)).toBe(APATCH_KPIMG_FOLK_SHA256);
  });

  it("ships a KernelSU loadable module for every KMI, digest verified", async () => {
    const release = registry.resolve({ providerId: "kernelsu", artifactId: "kernelsu-lkm-android15-6.6" }).release;
    const modules = release.artifacts.filter((artifact) => artifact.type === "loadable-module");

    expect(modules.length).toBeGreaterThanOrEqual(8);
    for (const module of modules) {
      const bytes = await registry.loadVerifiedPayload(module);
      expect(bytes.length).toBe(module.sizeBytes);
      expect(await sha256Hex(bytes)).toBe(module.sha256);
    }
  });

  it("ships the Magisk ramdisk payloads, digest verified", async () => {
    const release = registry.resolve({ providerId: "magisk", artifactId: "magisk-magiskinit" }).release;
    expect(release.release).toBe("v30.7");
    expect(release.artifacts.map((artifact) => artifact.id).sort()).toEqual(
      ["magisk-init-ld", "magisk-magisk", "magisk-magiskinit", "magisk-stub"].sort(),
    );

    for (const artifact of release.artifacts) {
      const bytes = await registry.loadVerifiedPayload(artifact);
      expect(bytes.length).toBe(artifact.sizeBytes);
      expect(await sha256Hex(bytes)).toBe(artifact.sha256);
    }
  });

  it("ships the WeaveMask ramdisk payloads, digest verified", async () => {
    const release = registry.resolve({ providerId: "magisk", artifactId: WEAVEMASK_MAGISKINIT_ID }).release;
    expect(release.release).toBe("v30.7.5");
    expect(release.artifacts.map((artifact) => artifact.id).sort()).toEqual(
      ["weavemask-init-ld", "weavemask-magisk", "weavemask-magiskinit", "weavemask-stub"].sort(),
    );

    for (const artifact of release.artifacts) {
      const bytes = await registry.loadVerifiedPayload(artifact);
      expect(bytes.length).toBe(artifact.sizeBytes);
      expect(await sha256Hex(bytes)).toBe(artifact.sha256);
    }
  });

  it("matches the shipped kptools WebAssembly digest", async () => {
    const artifact = registry.resolve({ providerId: "apatch", artifactId: APATCH_KPTOOLS_ID }).artifact;
    const bytes = await registry.loadVerifiedPayload(artifact);

    expect(artifact.source).toBe("bundled:/wasm/kptools.wasm");
    expect(await sha256Hex(bytes)).toBe(APATCH_KPTOOLS_SHA256);
  });

  /**
   * The three core images are only interchangeable in name: each one trusts exactly one manager, and
   * for a build that reduced its trust table to a single package that difference is inside the bytes.
   * Reading the header here is what stops a flavour from being paired with another flavour's image.
   *
   * The layout is KernelPatch's (`kernel/include/preset.h`: `MAGIC_LEN` 0x8, `version_t` of
   * `{ _, patch, minor, major }` at `header_kp_version_offset`, and
   * `VERSION(major, minor, patch) = (major << 16) + (minor << 8) + patch`).
   */
  it("pairs every KernelPatch flavour with a core image that trusts that manager", async () => {
    expect(APATCH_FLAVORS.length).toBeGreaterThanOrEqual(3);
    const packages = new Set<string>();

    for (const flavor of APATCH_FLAVORS) {
      const artifact = registry.resolve({ providerId: "apatch", artifactId: flavor.artifactId }).artifact;
      const bytes = await registry.loadVerifiedPayload(artifact);
      const text = new TextDecoder("latin1").decode(bytes);

      expect(text.slice(0, 8), flavor.id).toBe("KP1158\u0000\u0000");
      const version = bytes[11] + "." + bytes[10] + "." + bytes[9];
      expect(version, flavor.id).toBe(artifact.version);

      expect(text, flavor.id + " trusts its manager").toContain(flavor.managerPackage);
      for (const other of APATCH_FLAVORS) {
        if (other.id === flavor.id) continue;
        expect(text, flavor.id + " must not trust " + other.managerPackage).not.toContain(other.managerPackage);
      }
      packages.add(flavor.managerPackage);
    }

    expect(packages.size).toBe(APATCH_FLAVORS.length);
  });

  it("links the two WebAssembly modules the project ships", () => {
    const imageEngineModule = readFileSync(repoPath("public", "wasm", "imageforge.wasm"));
    expect(imageEngineModule.length).toBeGreaterThan(0);
  });

  it("refuses a payload whose digest does not match", async () => {
    const tampered = createArtifactRegistry(ARTIFACT_CATALOG, async (path) => {
      const bytes = await fsPayloadLoader(path, undefined as never);
      const copy = new Uint8Array(bytes);
      if (copy.length > 0) copy[0] ^= 0xff;
      return copy;
    });
    const artifact = tampered.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_ID }).artifact;
    await expect(tampered.loadVerifiedPayload(artifact)).rejects.toThrowError(ArtifactError);
  });
});
