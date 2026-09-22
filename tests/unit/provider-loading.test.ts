import { describe, expect, it, vi } from "vitest";
import {
  ProviderRegistry,
  createArtifactRegistry,
  createProviderRegistry,
  evaluateCompatibility,
  parseImage,
} from "@/core";
import type { PatchAnalysis, PatchPlan, PatchProvider, ParsedImage } from "@/core";
import type { ArtifactRegistry } from "@/core/artifacts/registry";
import { buildBootImage } from "../fixtures/bootimg";

const artifacts = createArtifactRegistry();

async function image(): Promise<ParsedImage> {
  return parseImage(await buildBootImage({}));
}

function stubProvider(id: string, name: string): PatchProvider {
  const analysis: PatchAnalysis = {
    providerId: id,
    summary: "stub",
    supportedTargets: ["boot"],
    notes: [],
  };
  return {
    id,
    name,
    analyze: async () => analysis,
    resolve: async () => ({}) as PatchPlan,
    patch: async () => ({}) as never,
    verify: async () => ({}) as never,
  };
}

describe("provider loading", () => {
  it("imports no implementation to describe the candidates", async () => {
    const providers = createProviderRegistry(artifacts);
    const parsed = await image();

    expect(providers.loadedProviderIds()).toEqual([]);
    const result = evaluateCompatibility({ image: parsed, providers, artifacts });

    // the compatibility engine only needs the descriptors
    expect(providers.loadedProviderIds()).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.providerId)).toContain("apatch");
  });

  it("imports exactly the provider a run asks for", async () => {
    const providers = createProviderRegistry(artifacts);
    const parsed = await image();

    await providers.get("kernelsu")?.analyze(parsed);
    expect(providers.loadedProviderIds()).toEqual(["kernelsu"]);

    await providers.get("magisk")?.analyze(parsed);
    expect(providers.loadedProviderIds()).toEqual(["kernelsu", "magisk"]);
  });

  it("reports the descriptor name before the implementation is loaded", async () => {
    const providers = createProviderRegistry(artifacts);

    expect(providers.get("apatch")?.name).toBe("APatch");
    expect(providers.get("mock")?.name).toBe("Mock Provider");
    expect(providers.loadedProviderIds()).toEqual([]);
  });

  it("imports a provider once, even when the first calls overlap", async () => {
    const registry = new ProviderRegistry();
    const load = vi.fn(async () => (_artifacts: ArtifactRegistry) => stubProvider("stub", "Stub"));
    registry.registerLazy("stub", load, artifacts);
    const provider = registry.get("stub");
    const parsed = await image();

    await Promise.all([provider?.analyze(parsed), provider?.analyze(parsed), provider?.analyze(parsed)]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(registry.loadedProviderIds()).toEqual(["stub"]);
  });

  it("keeps a provider that is not implemented in this build unavailable", () => {
    const registry = new ProviderRegistry();
    registry.registerDescriptor({
      id: "planned",
      name: "Planned",
      description: "not here yet",
      status: "planned",
      notes: [],
      supportedFormats: ["boot"],
      supportedHeaderVersions: [4],
      supportedArchitectures: ["arm64"],
      requiresKernel: false,
      requiresRamdisk: false,
    });

    expect(registry.get("planned")).toBeUndefined();
    expect(registry.availableProviderIds()).toEqual([]);
    expect(registry.descriptors().map((descriptor) => descriptor.id)).toEqual(["planned"]);
  });
});
