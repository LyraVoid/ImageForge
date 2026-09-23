import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasWebCrypto, sha1Hex, sha256Hex, sha256OfParts } from "@/core/hash";
import { IMAGEFORGE_WASM, fetchWasmAsset } from "@/wasm/assets";
import { loadWasmModule, resetWasmModule } from "@/wasm/loader";

const realCrypto = globalThis.crypto;

/** Hides WebCrypto for one test, the way a page served over plain HTTP sees the world. */
function withoutWebCrypto<T>(body: () => Promise<T>): Promise<T> {
  Object.defineProperty(globalThis, "crypto", {
    value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
    configurable: true,
  });
  return body().finally(() => {
    Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true });
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true });
  resetWasmModule();
});

/**
 * `crypto.subtle` exists only in a secure context, and a deployment can be served from one that is
 * not — a plain HTTP preview, an address that is not localhost. The app hashes bytes to verify every
 * artifact it runs, so that had to stop being fatal: this is the deployment failure it produced
 * ("The digest of /wasm/imageforge.wasm could not be checked: WebCrypto SubtleCrypto is not
 * available in this runtime"), turned into a test.
 */
describe("hashing without WebCrypto", () => {
  it("produces the same digests as WebCrypto", async () => {
    const inputs = [
      new Uint8Array(0),
      new TextEncoder().encode("abc"),
      new TextEncoder().encode("a".repeat(1000)),
      new Uint8Array(200_000).map((_, index) => index % 251),
    ];

    const withSubtle = await Promise.all(inputs.map((bytes) => sha256Hex(bytes)));
    const withoutSubtle = await withoutWebCrypto(() => Promise.all(inputs.map((bytes) => sha256Hex(bytes))));
    expect(withoutSubtle).toEqual(withSubtle);

    // The published vectors, so this is not only a comparison with itself.
    expect(withSubtle[1]).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha1Hex(inputs[1])).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(await withoutWebCrypto(() => sha1Hex(inputs[1]))).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d",
    );
  });

  it("reports whether the runtime has WebCrypto", async () => {
    expect(hasWebCrypto()).toBe(true);
    await withoutWebCrypto(async () => {
      expect(hasWebCrypto()).toBe(false);
    });
  });

  it("still verifies a bundled module against its recorded digest", async () => {
    const file = new Uint8Array(readFileSync(join(process.cwd(), "public", IMAGEFORGE_WASM.path.slice(1))));
    const expected = await sha256Hex(file);

    await withoutWebCrypto(async () => {
      const loaded = await fetchWasmAsset(IMAGEFORGE_WASM);
      expect(loaded.ok ? "" : loaded.reason).toBe("");
      if (!loaded.ok) return;
      expect(await sha256Hex(loaded.bytes)).toBe(IMAGEFORGE_WASM.sha256);
      expect(IMAGEFORGE_WASM.sha256).toBe(expected);

      // And the module is usable, which is what the deployment needed all along.
      resetWasmModule();
      const module = await loadWasmModule();
      expect(module.kind).toBe("wasm");
      expect(module.status.available).toBe(true);
    });
  });

  it("hashes parts the same way whether or not WebCrypto is there", async () => {
    const parts = [new Uint8Array([1, 2, 3]), new Uint8Array(0), new Uint8Array([4, 5])];
    const withSubtle = await sha256OfParts(parts);
    const withoutSubtle = await withoutWebCrypto(() => sha256OfParts(parts));
    expect(withoutSubtle).toBe(withSubtle);
  });
});
