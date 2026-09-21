import { describe, expect, it } from "vitest";
import { createArtifactRegistry, createProviderRegistry, evaluateCompatibility, parseImage } from "@/core";
import { buildBootImage, makeRamdisk } from "../fixtures/bootimg";

function setup() {
  const artifacts = createArtifactRegistry();
  const providers = createProviderRegistry(artifacts);
  return { artifacts, providers };
}

describe("compatibility engine", () => {
  it("lists the mock provider as compatible and the real providers as unavailable", async () => {
    const { artifacts, providers } = setup();
    const image = parseImage(await buildBootImage({}));
    const result = evaluateCompatibility({ image, providers, artifacts });

    const mock = result.candidates.find((entry) => entry.providerId === "mock");
    expect(mock?.compatible).toBe(true);
    expect(mock?.available).toBe(true);

    for (const id of ["magisk", "kernelsu", "apatch"]) {
      const candidate = result.candidates.find((entry) => entry.providerId === id);
      expect(candidate?.available).toBe(false);
      expect(candidate?.compatible).toBe(false);
      expect(candidate?.reasons.join(" ")).toMatch(/Not implemented in this build/);
    }
    expect(result.compatible).toBe(true);
  });

  it("flags an image without a ramdisk", async () => {
    const { artifacts, providers } = setup();
    const image = parseImage(await buildBootImage({ ramdisk: null }));
    const result = evaluateCompatibility({ image, providers, artifacts });
    const mock = result.candidates.find((entry) => entry.providerId === "mock");
    expect(mock?.compatible).toBe(false);
    expect(mock?.reasons.join(" ")).toMatch(/no ramdisk section/);
  });

  it("warns when the architecture cannot be determined", async () => {
    const { artifacts, providers } = setup();
    const image = parseImage(await buildBootImage({ kernel: null, ramdisk: await makeRamdisk(512) }));
    const result = evaluateCompatibility({ image, providers, artifacts });
    const mock = result.candidates.find((entry) => entry.providerId === "mock");
    expect(mock?.compatible).toBe(true);
    expect(mock?.warnings.map((warning) => warning.code)).toContain("unknown-architecture");
  });

  it("warns when the ramdisk payload cannot be expanded", async () => {
    const { artifacts, providers } = setup();
    const lz4Payload = new Uint8Array([0x02, 0x21, 0x4c, 0x18, 0x00, 0x00, 0x00, 0x00]);
    const image = parseImage(await buildBootImage({ ramdisk: lz4Payload }));
    const result = evaluateCompatibility({ image, providers, artifacts });
    const mock = result.candidates.find((entry) => entry.providerId === "mock");
    expect(mock?.warnings.map((warning) => warning.code)).toContain("unsupported-compression");
    expect(result.warnings.join(" ")).toMatch(/LZ4/);
  });

  it("reports no artifact release for a provider that has none", async () => {
    const artifacts = createArtifactRegistry();
    const providers = createProviderRegistry(artifacts);
    providers.registerDescriptor({
      id: "custom",
      name: "Custom",
      description: "test provider",
      status: "available",
      notes: [],
      supportedFormats: ["boot", "init_boot", "vendor_boot"],
      supportedHeaderVersions: [0, 1, 2, 3, 4],
      supportedArchitectures: ["arm64"],
    });
    providers.register(
      {
        id: "custom",
        name: "Custom",
        analyze: async () => ({ providerId: "custom", summary: "", supportedTargets: [], notes: [] }),
        resolve: async () => {
          throw new Error("not used");
        },
        patch: async () => {
          throw new Error("not used");
        },
        verify: async () => {
          throw new Error("not used");
        },
      },
      undefined,
    );
    const image = parseImage(await buildBootImage({}));
    const result = evaluateCompatibility({ image, providers, artifacts });
    const candidate = result.candidates.find((entry) => entry.providerId === "custom");
    expect(candidate?.compatible).toBe(false);
    expect(candidate?.reasons.join(" ")).toMatch(/No artifact release/);
  });
});
