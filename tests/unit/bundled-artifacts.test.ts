import { describe, expect, it } from "vitest";
import {
  APATCH_KPIMG_ASTER_ID,
  APATCH_KPIMG_ASTER_SHA256,
  APATCH_KPIMG_ID,
  APATCH_KPIMG_SHA256,
  APATCH_KPTOOLS_ID,
  APATCH_KPTOOLS_SHA256,
  ARTIFACT_CATALOG,
  ArtifactError,
  createArtifactRegistry,
} from "@/core";
import { sha256Hex } from "@/core/hash";
import { fsPayloadLoader, repoPath } from "../fixtures/artifacts";
import { readFileSync } from "node:fs";

const registry = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);

describe("bundled artifacts", () => {
  it("registers the upstream release and the Aster fork release", () => {
    expect(registry.releases("apatch").map((release) => release.release)).toEqual(["11224", "aster-0ff4ae2"]);
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
      ["magisk-init-ld-xz", "magisk-magisk-xz", "magisk-magiskinit", "magisk-stub-xz"].sort(),
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
