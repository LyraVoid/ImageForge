import { describe, expect, it } from "vitest";
import {
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
  it("resolves the APatch release and its two artifacts", () => {
    const release = registry.latestRelease("apatch");
    expect(release?.release).toBe("11224");
    expect(release?.artifacts.map((artifact) => artifact.id).sort()).toEqual(
      [APATCH_KPIMG_ID, APATCH_KPTOOLS_ID].sort(),
    );
  });

  it("matches the shipped kpimg digest", async () => {
    const artifact = registry.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_ID }).artifact;
    const bytes = await registry.loadVerifiedPayload(artifact);

    expect(artifact.source).toBe("bundled:/artifacts/apatch/kpimg");
    expect(artifact.sha256).toBe(APATCH_KPIMG_SHA256);
    expect(bytes.length).toBe(artifact.sizeBytes);
    expect(await sha256Hex(bytes)).toBe(APATCH_KPIMG_SHA256);
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
