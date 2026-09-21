import { beforeEach, describe, expect, it } from "vitest";
import { useForgeStore } from "@/stores/forge-store";
import { buildBootImage, toFile } from "../fixtures/bootimg";

const store = () => useForgeStore.getState();

async function loadImage(): Promise<{ file: File; bytes: Uint8Array }> {
  // The fixture already carries a bootconfig, so the mock manifest does not grow the image.
  const bytes = await buildBootImage({ bootconfig: new TextEncoder().encode("x".repeat(8192)) });
  return { file: toFile(bytes, "boot.img"), bytes };
}

describe("forge store workflow", () => {
  beforeEach(async () => {
    await store().reset();
  });

  it("passes the output options chosen on the patch page to the patch run itself", async () => {
    const { file, bytes } = await loadImage();
    expect(await store().analyzeFile(file)).not.toBeNull();

    const plan = await store().selectProvider("mock", {
      configuration: { preserveImageSize: "true" },
    });
    expect(plan?.configuration.preserveImageSize).toBe("true");

    expect(await store().runPatch()).toBe(true);
    const output = store().output;
    expect(output?.metadata.preserveImageSize).toBe("true");
    expect(output?.sizeBytes).toBe(bytes.length);
    expect(output?.blob.size).toBe(bytes.length);
  }, 60000);

  it("keeps the current plan on screen while re-planning the same provider", async () => {
    const { file } = await loadImage();
    await store().analyzeFile(file);
    const first = await store().selectProvider("mock");
    expect(first).not.toBeNull();

    const pending = store().selectProvider("mock", { configuration: { preserveImageSize: "true" } });
    expect(store().planResponse).not.toBeNull();
    expect(store().planResponse?.plan.providerId).toBe("mock");

    await pending;
    expect(store().planResponse?.plan.configuration.preserveImageSize).toBe("true");
  }, 60000);

  it("drops the previous plan when a different provider is selected", async () => {
    const { file } = await loadImage();
    await store().analyzeFile(file);
    await store().selectProvider("mock");

    const pending = store().selectProvider("apatch");
    expect(store().planResponse).toBeNull();
    await pending;
    expect(store().error).not.toBeNull();
  }, 60000);

  it("clears the remembered options on reset", async () => {
    const { file } = await loadImage();
    await store().analyzeFile(file);
    await store().selectProvider("mock", { configuration: { preserveImageSize: "true" } });
    await store().reset();
    expect(store().providerOptions).toBeNull();
    expect(store().planResponse).toBeNull();
    expect(store().stage).toBe("empty");
  }, 60000);
});
