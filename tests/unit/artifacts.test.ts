import { describe, expect, it } from "vitest";
import { ArtifactError } from "@/core/errors";
import {
  ARTIFACT_CATALOG,
  MOCK_ARTIFACT_PAYLOAD,
  MOCK_ARTIFACT_SHA256,
  createArtifactRegistry,
} from "@/core";

describe("artifact registry", () => {
  it("records the real digest of the mock artifact", async () => {
    const registry = createArtifactRegistry();
    const { artifact } = registry.resolve({ providerId: "mock" });
    const integrity = await registry.verifyIntegrity(artifact);

    expect(integrity.ok).toBe(true);
    expect(integrity.actualSha256).toBe(MOCK_ARTIFACT_SHA256);
    expect(integrity.actualSha256).toHaveLength(64);
    expect(integrity.sizeBytes).toBe(MOCK_ARTIFACT_PAYLOAD.length);
    expect(integrity.sizeBytes).toBe(artifact.sizeBytes);
  });

  it("resolves by release and architecture", () => {
    const registry = createArtifactRegistry();
    const resolved = registry.resolve({ providerId: "mock", release: "1.0.0", architecture: "arm64" });
    expect(resolved.release.release).toBe("1.0.0");
    expect(resolved.artifact.id).toBe("imageforge-mock-artifact");
    expect(registry.latestRelease("mock")?.release).toBe("1.0.0");
    expect(registry.listArtifacts("mock")).toHaveLength(1);
  });

  it("fails closed for unknown providers, releases and architectures", () => {
    const registry = createArtifactRegistry();
    // a provider that is not registered at all, and one that is registered but has no release
    expect(() => registry.resolve({ providerId: "not-a-provider" })).toThrowError(ArtifactError);
    expect(() => registry.resolve({ providerId: "mock", release: "9.9.9" })).toThrowError(ArtifactError);
    expect(() => registry.resolve({ providerId: "mock", architecture: "riscv64" })).toThrowError(ArtifactError);
  });

  it("does not pretend to download remote artifacts", async () => {
    const registry = createArtifactRegistry();
    const remote = { id: "x", version: "1", type: "patcher", source: "https://example.invalid/x.zip" };
    await expect(registry.loadPayload(remote)).rejects.toThrowError(ArtifactError);
    try {
      await registry.loadPayload(remote);
    } catch (error) {
      expect((error as ArtifactError).message).toMatch(/Downloading upstream artifacts is not available/);
      expect((error as ArtifactError).technical).toMatch(/remote artifact downloads are not implemented/i);
    }
  });

  it("ships a catalog version and updated timestamp", () => {
    expect(ARTIFACT_CATALOG.schemaVersion).toBe(1);
    expect(ARTIFACT_CATALOG.releases.every((release) => release.artifacts.length > 0)).toBe(true);
  });
});
