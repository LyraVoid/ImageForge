import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
import { DecompressionStream, CompressionStream } from "node:stream/web";

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
