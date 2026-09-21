import type { WasmImageModule, WasmStatus } from "./abi";
import { WASM_PATH } from "./abi";

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  const entries = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (0xedb88320 ^ (crc >>> 1)) >>> 0 : crc >>> 1;
    }
    entries[i] = crc >>> 0;
  }
  table = entries;
  return entries;
}

export function crc32(bytes: Uint8Array): number {
  const entries = crcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (entries[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function lz4BlockMaxSize(srcLength: number): number {
  return srcLength * 255 + 16;
}

export function lz4DecompressBlock(input: Uint8Array, expectedSize: number): Uint8Array {
  const output = new Uint8Array(expectedSize);
  let sp = 0;
  let dp = 0;

  while (sp < input.length) {
    const token = input[sp];
    sp += 1;

    let literalLength = token >>> 4;
    if (literalLength === 15) {
      for (;;) {
        if (sp >= input.length) throw new Error("Truncated LZ4 literal length.");
        const next = input[sp];
        sp += 1;
        literalLength += next;
        if (next !== 255) break;
      }
    }
    if (sp + literalLength > input.length || dp + literalLength > output.length) {
      throw new Error("LZ4 block overruns the destination buffer.");
    }
    output.set(input.subarray(sp, sp + literalLength), dp);
    sp += literalLength;
    dp += literalLength;

    if (sp >= input.length) break;
    if (sp + 2 > input.length) throw new Error("Truncated LZ4 match offset.");
    const offset = input[sp] | (input[sp + 1] << 8);
    sp += 2;
    if (offset === 0 || offset > dp) throw new Error("Invalid LZ4 match offset.");

    let matchLength = token & 0x0f;
    if (matchLength === 15) {
      for (;;) {
        if (sp >= input.length) throw new Error("Truncated LZ4 match length.");
        const next = input[sp];
        sp += 1;
        matchLength += next;
        if (next !== 255) break;
      }
    }
    matchLength += 4;
    if (dp + matchLength > output.length) throw new Error("LZ4 match overruns the destination buffer.");

    const srcPos = dp - offset;
    for (let i = 0; i < matchLength; i += 1) output[dp + i] = output[srcPos + i];
    dp += matchLength;
  }

  return output.subarray(0, dp);
}

export function createTypeScriptModule(reason = "The WebAssembly module is not loaded."): WasmImageModule {
  const status: WasmStatus = { available: false, path: WASM_PATH, version: null, reason };
  return {
    kind: "typescript",
    status,
    crc32,
    lz4DecompressBlock,
    lz4BlockMaxSize,
  };
}
