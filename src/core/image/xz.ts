import { loadWasmModule } from "../../wasm/loader";

/**
 * xz, the container Magisk's patcher uses for its ramdisk payloads and one of the containers
 * Android kernels and ramdisks come in. The codec lives in the WebAssembly module, which uses the
 * same crate, version and settings as magiskboot (lzma-rust2 0.21.0, preset 6, CRC32 check).
 */

/** The dictionary the reference encoder actually searches with (preset 6, from the crate's table). */
export const XZ_ENCODER_DICTIONARY = 8 * 1024 * 1024;

/**
 * The dictionary the official Magisk patcher *declares* in the streams it writes: `xz --list
 * --verbose --verbose` on its `.backup/init.xz` and on the `overlay.d/sbin/*.xz` payloads of a
 * device image reports `--lzma2=dict=64MiB` (preset 9). Its compressed data is identical to ours
 * for these payloads, because nothing in them lies further back than the input length; only the
 * property byte and the header checksum that covers it differ.
 */
export const REFERENCE_XZ_DICTIONARY = 64 * 1024 * 1024;

export async function decodeXz(bytes: Uint8Array): Promise<Uint8Array> {
  const wasm = await loadWasmModule();
  return wasm.xzDecompress(bytes);
}

export interface XzEncodeOptions {
  /**
   * Dictionary size to declare in the stream header. A decoder allocates the window the header
   * names, so declaring a value at least as large as the one we searched with is always valid; it
   * is what makes a stream byte for byte the one the reference patcher writes.
   */
  declareDictionarySize?: number;
}

export async function encodeXz(raw: Uint8Array, options: XzEncodeOptions = {}): Promise<Uint8Array> {
  const wasm = await loadWasmModule();
  const stream = wasm.xzCompress(raw);
  const declared = options.declareDictionarySize;
  if (declared === undefined || declared === XZ_ENCODER_DICTIONARY) return stream;
  return declareDictionary(stream, declared);
}

/** The LZMA2 property byte that asks a decoder for `dictionarySize` bytes of window. */
export function dictionaryProperty(dictionarySize: number): number {
  for (let property = 0; property <= 40; property += 1) {
    const size = (2 | (property & 1)) * 2 ** (Math.floor(property / 2) + 11);
    if (size === dictionarySize) return property;
  }
  throw new Error("The LZMA2 property byte cannot name a dictionary of " + dictionarySize + " bytes.");
}

/**
 * Rewrites the dictionary property of a single block xz stream, together with the block header
 * checksum that covers it. Only the header changes: the block data, its checksum and the stream
 * footer stay untouched, so the stream still describes the same payload.
 */
export async function declareDictionary(stream: Uint8Array, dictionarySize: number): Promise<Uint8Array> {
  if (dictionarySize < XZ_ENCODER_DICTIONARY) {
    throw new Error(
      "Refusing to declare a " +
        dictionarySize +
        " byte dictionary for a stream searched with " +
        XZ_ENCODER_DICTIONARY +
        ".",
    );
  }
  const magic = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];
  if (stream.length < 24 || magic.some((byte, index) => stream[index] !== byte)) {
    throw new Error("Not an xz stream.");
  }
  const headerSize = (stream[12] + 1) * 4;
  const crcAt = 12 + headerSize - 4;
  if (stream[13] !== 0x00 || stream[14] !== 0x21 || stream[15] !== 0x01 || crcAt > stream.length) {
    throw new Error("This xz stream does not use a single LZMA2 filter in one block header.");
  }
  for (let offset = 17; offset < crcAt; offset += 1) {
    if (stream[offset] !== 0x00) throw new Error("Unexpected filter chain in this xz stream.");
  }

  const patched = new Uint8Array(stream);
  patched[16] = dictionaryProperty(dictionarySize);
  const wasm = await loadWasmModule();
  const crc = wasm.crc32(patched.subarray(12, crcAt));
  patched[crcAt] = crc & 0xff;
  patched[crcAt + 1] = (crc >>> 8) & 0xff;
  patched[crcAt + 2] = (crc >>> 16) & 0xff;
  patched[crcAt + 3] = (crc >>> 24) & 0xff;
  return patched;
}
