import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The offline side of the app is files rather than code: a manifest, a service worker and the icons it
 * caches. There is no browser here to install the app in, so this checks the contract instead — the
 * things that make it installable and the things it promises to cache.
 */
const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");
const publicPath = (path: string): string => join(process.cwd(), "public", path);

describe("the installable app", () => {
  it("has a manifest that says what it is and carries real icons", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
      name: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string; type: string }[];
    };
    expect(manifest.name).toBe("ImageForge");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      const file = publicPath(icon.src.replace(/^\//, ""));
      expect(existsSync(file), icon.src).toBe(true);
      const bytes = readFileSync(file);
      // a PNG signature, and the size it claims written into the IHDR
      expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(bytes.readUInt32BE(16)).toBe(width);
      expect(bytes.readUInt32BE(20)).toBe(height);
    }
  });

  it("links the manifest from the page and registers the worker from the app", () => {
    expect(read("index.html")).toContain('rel="manifest"');
    const main = read("src/main.tsx");
    expect(main).toContain("serviceWorker.register");
    expect(main).toContain("import.meta.env.PROD");
  });

  it("precaches the shell and the codecs, and falls back to the shell offline", () => {
    const worker = read("public/sw.js");
    for (const needed of ["/", "/manifest.webmanifest", "/wasm/imageforge.wasm", "/wasm/lz4.wasm", "/wasm/bzip2.wasm"]) {
      expect(worker, needed).toContain(needed);
    }
    // a navigation goes to the network first and to the cached shell when there is none
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain("caches.match(request)");
    expect(worker).toContain("/artifacts/");
  });
});
