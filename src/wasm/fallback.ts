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

export function lz4DecompressBlock(
  input: Uint8Array,
  expectedSize: number,
  prefix?: Uint8Array,
): Uint8Array {
  const prefixLength = prefix ? prefix.length : 0;
  const output = new Uint8Array(prefixLength + expectedSize);
  if (prefix && prefixLength > 0) output.set(prefix, 0);
  let sp = 0;
  let dp = prefixLength;

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

  return output.subarray(prefixLength, dp);
}

const MIN_MATCH = 4;
const LAST_LITERALS = 5;
const MF_LIMIT = 12;
const MAX_OFFSET = 65535;
const HASH_LOG = 16;

function hash4(value: number): number {
  return Math.imul(value, 2654435761) >>> (32 - HASH_LOG);
}

function readU32(data: Uint8Array, index: number): number {
  return (data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24)) >>> 0;
}

function writeLength(output: Uint8Array, start: number, length: number): number {
  let pos = start;
  let remaining = length;
  while (remaining >= 255) {
    output[pos] = 255;
    pos += 1;
    remaining -= 255;
  }
  output[pos] = remaining;
  return pos + 1;
}

/**
 * Greedy LZ4 block compressor. It mirrors crates/imageforge-wasm exactly, so the
 * WebAssembly path and this fallback produce identical bytes.
 */
function xzUnavailable(): never {
  throw new Error("XZ support needs the WebAssembly module; hard refresh if this page predates it.");
}

export function xzDecompress(): never {
  return xzUnavailable();
}

export function xzCompress(): never {
  return xzUnavailable();
}

export function lz4CompressBlock(input: Uint8Array): Uint8Array {
  const n = input.length;
  if (n === 0) return new Uint8Array(0);

  const output = new Uint8Array(n + Math.ceil(n / 255) + 32);
  const table = new Uint32Array(1 << HASH_LOG);
  const matchLimit = n - LAST_LITERALS;
  let pos = 0;
  let anchor = 0;
  let i = 0;

  while (i + MF_LIMIT <= n) {
    const sequence = readU32(input, i);
    const slot = hash4(sequence);
    const candidate = table[slot];
    table[slot] = i;

    if (candidate < i && i - candidate <= MAX_OFFSET && readU32(input, candidate) === sequence) {
      let matchLength = MIN_MATCH;
      while (i + matchLength < matchLimit && input[candidate + matchLength] === input[i + matchLength]) {
        matchLength += 1;
      }

      const literalLength = i - anchor;
      const matchCode = matchLength - MIN_MATCH;
      const tokenPos = pos;
      pos += 1;
      output[tokenPos] =
        ((literalLength >= 15 ? 15 : literalLength) << 4) | (matchCode >= 15 ? 15 : matchCode);

      if (literalLength >= 15) pos = writeLength(output, pos, literalLength - 15);
      output.set(input.subarray(anchor, anchor + literalLength), pos);
      pos += literalLength;

      const offset = i - candidate;
      output[pos] = offset & 0xff;
      output[pos + 1] = (offset >> 8) & 0xff;
      pos += 2;

      if (matchCode >= 15) pos = writeLength(output, pos, matchCode - 15);

      i += matchLength;
      anchor = i;
    } else {
      i += 1;
    }
  }

  const literalLength = n - anchor;
  const tokenPos = pos;
  pos += 1;
  output[tokenPos] = (literalLength >= 15 ? 15 : literalLength) << 4;
  if (literalLength >= 15) pos = writeLength(output, pos, literalLength - 15);
  output.set(input.subarray(anchor, n), pos);
  pos += literalLength;

  return output.subarray(0, pos);
}

export function createTypeScriptModule(reason = "The WebAssembly module is not loaded."): WasmImageModule {
  const status: WasmStatus = { available: false, path: WASM_PATH, version: null, reason };
  return {
    kind: "typescript",
    status,
    crc32,
    lz4DecompressBlock,
    lz4CompressBlock,
    lz4BlockMaxSize,
    // There is no TypeScript xz codec: the only implementation is the WebAssembly one, and saying
    // so is better than pretending the fallback can do it.
    xzDecompress,
    xzCompress,
  };
}
