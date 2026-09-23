import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ARTIFACT_CATALOG } from "@/core";
import { sha256Hex } from "@/core/hash";
import {
  BZIP2_WASM,
  IMAGEFORGE_WASM,
  LZ4_WASM,
  WASM_ASSETS,
  fetchWasmAsset,
  wasmAssetUrl,
} from "@/wasm/assets";
import { loadWasmModule, resetWasmModule } from "@/wasm/loader";

/**
 * The WebAssembly modules are bundled artifacts like any other, so they are registered with a
 * pinned digest and verified before they are instantiated. This is the test that keeps the record
 * honest: it hashes public/wasm itself, follows the register each module names, and checks that a
 * module that does not match its record is refused rather than executed.
 */
const publicFile = (path: string): string => join(process.cwd(), "public", path.replace(/^\//, ""));

describe("registered WebAssembly modules", () => {
  it("matches the digest and the size each module is registered with", async () => {
    expect(WASM_ASSETS.length).toBeGreaterThanOrEqual(3);
    for (const asset of WASM_ASSETS) {
      const bytes = new Uint8Array(readFileSync(publicFile(asset.path)));
      expect(bytes.length, asset.path).toBe(asset.sizeBytes);
      expect(await sha256Hex(bytes), asset.path).toBe(asset.sha256);
    }
  });

  it("names a register that records the same path, size and digest", () => {
    for (const asset of WASM_ASSETS) {
      const register = readFileSync(join(process.cwd(), asset.register), "utf8");
      expect(register, asset.id + " path").toContain(asset.path);
      expect(register, asset.id + " size").toContain(String(asset.sizeBytes));
      expect(register, asset.id + " digest").toContain(asset.sha256);
    }
  });

  it("fetches content addressed, so a stale cache entry is not served under a current URL", () => {
    for (const asset of WASM_ASSETS) {
      expect(wasmAssetUrl(asset)).toBe(asset.path + "?v=" + asset.sha256.slice(0, 16));
    }
  });

  it("serves a registered module through the real fetch path", async () => {
    const loaded = await fetchWasmAsset(LZ4_WASM);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.bytes.length).toBe(LZ4_WASM.sizeBytes);
    expect(await sha256Hex(loaded.bytes)).toBe(LZ4_WASM.sha256);
  });

  it("refuses bytes that hash to something else", async () => {
    const tampered = new Uint8Array(readFileSync(publicFile(BZIP2_WASM.path)));
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(tampered, { status: 200 }));

    const loaded = await fetchWasmAsset(BZIP2_WASM);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toContain("hashed to");
    expect(loaded.reason).toContain(BZIP2_WASM.register);
  });

  it("refuses a module whose size is not the recorded one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(16), { status: 200 }));

    const loaded = await fetchWasmAsset(BZIP2_WASM);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toContain("records " + BZIP2_WASM.sizeBytes);
  });

  it("refuses a module the deployment does not have", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

    const loaded = await fetchWasmAsset(BZIP2_WASM);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toContain("404");
  });

  it("instantiates the project module when its bytes match the record", async () => {
    resetWasmModule();
    const module = await loadWasmModule();
    expect(module.kind).toBe("wasm");
    expect(module.status.available).toBe(true);
    expect(module.status.path).toBe(IMAGEFORGE_WASM.path);
    resetWasmModule();
  });

  it("says why the project module is not in use instead of running bytes it did not verify", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(16), { status: 200 }));

    resetWasmModule();
    const module = await loadWasmModule();
    expect(module.kind).toBe("typescript");
    expect(module.status.available).toBe(false);
    expect(module.status.reason).toContain("records " + IMAGEFORGE_WASM.sizeBytes);
    resetWasmModule();
  });

  it("precaches every registered module for offline use, whichever layer fetches it", () => {
    const worker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
    // The provider's module is registered in the artifact catalog rather than in the wasm layer, so
    // the list of modules to check comes from both records.
    const fromCatalog = ARTIFACT_CATALOG.releases
      .flatMap((release) => release.artifacts)
      .map((artifact) => artifact.source ?? "")
      .filter((source) => source.startsWith("bundled:/wasm/"))
      .map((source) => source.slice("bundled:".length));
    const paths = [...WASM_ASSETS.map((asset) => asset.path), ...fromCatalog];
    expect(paths.length).toBeGreaterThanOrEqual(4);
    for (const path of paths) expect(worker, path).toContain('"' + path + '"');
  });
});
