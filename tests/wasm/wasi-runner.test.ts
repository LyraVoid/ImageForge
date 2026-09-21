import { describe, expect, it } from "vitest";
import {
  APATCH_KPIMG_ASTER_ID,
  APATCH_KPIMG_ID,
  APATCH_KPTOOLS_ID,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
} from "@/core";
import { clearWasiModuleCache, compileWasiModule, runWasiTool } from "@/wasm/wasi-runner";
import { fsPayloadLoader } from "../fixtures/artifacts";

const registry = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);

async function loadKptools(): Promise<WebAssembly.Module> {
  const artifact = registry.resolve({ providerId: "apatch", artifactId: APATCH_KPTOOLS_ID }).artifact;
  const bytes = await registry.loadVerifiedPayload(artifact);
  return compileWasiModule("test-kptools", bytes);
}

describe("WASI tool runner", () => {
  it("runs the upstream kptools module and reads its version", async () => {
    const module = await loadKptools();
    const result = await runWasiTool({ module, args: ["-v"] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join(" ")).toMatch(/[0-9a-f]{3,}/);
  });

  it("prints the upstream usage text", async () => {
    const module = await loadKptools();
    const result = await runWasiTool({ module, args: ["-h"] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("Kernel Image Patch Tools");
    expect(result.stdout.join("\n")).toContain("--patch");
  });

  it("gives the guest a file system it can read and write", async () => {
    const module = await loadKptools();
    const input = new TextEncoder().encode("not a kernel image");
    const result = await runWasiTool({ module, args: ["-i", "/probe.bin", "-f"], files: { "probe.bin": input } });

    expect(result.files["probe.bin"]).toBeInstanceOf(Uint8Array);
    expect(result.stdout.concat(result.stderr).length).toBeGreaterThan(0);
  });

  it("reports the version of each bundled KernelPatch core image", async () => {
    const module = await loadKptools();

    for (const [artifactId, expected] of [
      [APATCH_KPIMG_ID, /d03/],
      [APATCH_KPIMG_ASTER_ID, /d08/],
    ] as const) {
      const artifact = registry.resolve({ providerId: "apatch", artifactId }).artifact;
      const kpimg = await registry.loadVerifiedPayload(artifact);
      const result = await runWasiTool({ module, args: ["-v", "-k", "/kpimg"], files: { kpimg } });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join(" ")).toMatch(expected);
    }
  }, 120000);

  it("caches compiled modules by key", async () => {
    clearWasiModuleCache();
    const first = await loadKptools();
    const second = await loadKptools();
    expect(first).toBe(second);
  });
});
