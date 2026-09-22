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
// jsdom's Blob has no stream(); the gzip codecs build their pipelines on it.
if (typeof Blob !== "undefined" && typeof Blob.prototype.stream !== "function") {
  Object.defineProperty(Blob.prototype, "stream", {
    configurable: true,
    writable: true,
    value: function stream(this: Blob): ReadableStream<Uint8Array> {
      return new ReadableStream<Uint8Array>({
        start: async (controller) => {
          controller.enqueue(new Uint8Array(await this.arrayBuffer()));
          controller.close();
        },
      });
    },
  });
}

// A browser loads the WebAssembly module and the bundled artifacts over fetch. Serving exactly
// those paths from public/ under Node means the tests exercise the real codecs and the real digests
// instead of a stub. Every other URL (a remote artifact, for one) keeps the runtime's behaviour,
// which the artifact tests depend on.
const runtimeFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/wasm/") || url.startsWith("/artifacts/")) {
    const path = url.split("?")[0];
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(join(process.cwd(), "public", path.replace(/^\/+/, ""))));
    } catch {
      return new Response(null, { status: 404 });
    }
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: { "content-type": url.startsWith("/wasm/") ? "application/wasm" : "application/octet-stream" },
    });
  }
  if (typeof runtimeFetch === "function") return runtimeFetch(input as never, init);
  throw new Error("fetch is not available in this runtime");
}) as typeof fetch;
