import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CompressionStream, DecompressionStream } from "node:stream/web";

const globalScope = globalThis as Record<string, unknown>;

if (!globalScope.crypto || !(globalScope.crypto as Crypto).subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
if (typeof globalScope.DecompressionStream === "undefined") {
  globalScope.DecompressionStream = DecompressionStream;
}
if (typeof globalScope.CompressionStream === "undefined") {
  globalScope.CompressionStream = CompressionStream;
}

// A browser loads the WebAssembly module over fetch. Serving exactly that path from public/ under
// Node means the tests exercise the real codec instead of the TypeScript fallback. Every other URL
// keeps the runtime's behaviour, which the artifact tests depend on.
const runtimeFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/wasm/")) {
    const bytes = readFileSync(join(process.cwd(), "public", url.replace(/^\/+/, "")));
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "content-type": "application/wasm" },
    });
  }
  if (typeof runtimeFetch === "function") return runtimeFetch(input as never, init);
  throw new Error("fetch is not available in this runtime");
}) as typeof fetch;
