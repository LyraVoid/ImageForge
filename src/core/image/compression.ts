import { startsWith } from "../binary";
import { decodeLz4, encodeLz4, parseLz4Settings } from "./lz4";
import type { Lz4Settings } from "./lz4";

export type CompressionFormat =
  | "none"
  | "gzip"
  | "lz4-legacy"
  | "lz4-frame"
  | "xz"
  | "lzma"
  | "bzip2"
  | "zstd"
  | "cpio"
  | "unknown";

export const COMPRESSION_LABEL: Record<CompressionFormat, string> = {
  none: "Uncompressed",
  gzip: "GZip",
  "lz4-legacy": "LZ4 (legacy)",
  "lz4-frame": "LZ4 (frame)",
  xz: "XZ",
  lzma: "LZMA",
  bzip2: "BZip2",
  zstd: "Zstandard",
  cpio: "CPIO (uncompressed)",
  unknown: "Unknown",
};

const SUPPORTED: readonly CompressionFormat[] = ["none", "cpio", "gzip", "lz4-frame", "lz4-legacy"];

/** Everything needed to reproduce the exact compression of a section. */
export interface CompressionDescriptor {
  format: CompressionFormat;
  lz4?: Lz4Settings;
}

export function detectCompression(bytes: Uint8Array): CompressionFormat {
  if (bytes.length === 0) return "none";
  if (startsWith(bytes, [0x1f, 0x8b])) return "gzip";
  if (startsWith(bytes, [0x02, 0x21, 0x4c, 0x18])) return "lz4-legacy";
  if (startsWith(bytes, [0x04, 0x22, 0x4d, 0x18])) return "lz4-frame";
  if (startsWith(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return "xz";
  if (startsWith(bytes, [0x5d, 0x00, 0x00])) return "lzma";
  if (startsWith(bytes, [0x42, 0x5a, 0x68])) return "bzip2";
  if (startsWith(bytes, [0x28, 0xb5, 0x2f, 0xfd])) return "zstd";
  if (startsWith(bytes, [0x30, 0x37, 0x30, 0x37, 0x30])) return "cpio";
  return "unknown";
}

export function isDecompressionSupported(format: CompressionFormat): boolean {
  return SUPPORTED.includes(format);
}

/**
 * True when a section can be handed to a provider as it is: either it is already raw
 * ("none", or "unknown" which means no recognised container magic matched, as with a
 * plain arm64 Image) or this build can expand it.
 */
export function isPayloadUsable(format: CompressionFormat): boolean {
  return format === "none" || format === "unknown" || isDecompressionSupported(format);
}

/**
 * Detects the compression of a section and captures the settings needed to write
 * the same container again. An LZ4 payload with a header we cannot reproduce is
 * reported as unknown so nothing tries to rewrite it.
 */
export function describeCompression(bytes: Uint8Array): CompressionDescriptor {
  const format = detectCompression(bytes);
  if (format === "lz4-frame" || format === "lz4-legacy") {
    try {
      return { format, lz4: parseLz4Settings(bytes) };
    } catch {
      return { format: "unknown" };
    }
  }
  return { format };
}

export async function decompress(bytes: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  if (format === "none" || format === "cpio" || format === "unknown") return bytes;
  if (!isDecompressionSupported(format)) {
    throw new Error("Decompression for " + COMPRESSION_LABEL[format] + " is not available in this build.");
  }
  return decompressSection(bytes, { format });
}

export async function decompressSection(
  bytes: Uint8Array,
  descriptor: CompressionDescriptor,
): Promise<Uint8Array> {
  switch (descriptor.format) {
    case "gzip":
      return inflateGzip(bytes);
    case "lz4-frame":
    case "lz4-legacy":
      return decodeLz4(bytes, descriptor.lz4);
    default:
      return bytes;
  }
}

export async function compressSection(
  raw: Uint8Array,
  descriptor: CompressionDescriptor,
): Promise<Uint8Array> {
  switch (descriptor.format) {
    case "gzip":
      return compressGzip(raw);
    case "lz4-frame":
    case "lz4-legacy":
      if (!descriptor.lz4) throw new Error("LZ4 settings are missing, cannot recompress the section.");
      return encodeLz4(raw, descriptor.lz4);
    default:
      return raw;
  }
}

/**
 * Pipes bytes through a compression transform manually. Blob.stream() and Response are
 * not available in every runtime (jsdom has neither), while the streams themselves are
 * polyfilled by the test setup.
 */
async function pipeThrough(
  bytes: Uint8Array,
  transform: { writable: WritableStream<BufferSource>; readable: ReadableStream<Uint8Array> },
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  const draining = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  })();

  // Node's stream implementation rejects a bare ArrayBuffer here, browsers accept both.
  await writer.write(bytes as unknown as BufferSource);
  await writer.close();
  await draining;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function inflateGzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is not available in this runtime.");
  }
  return pipeThrough(bytes, new DecompressionStream("gzip"));
}

export async function compressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream is not available in this runtime.");
  }
  return pipeThrough(bytes, new CompressionStream("gzip"));
}


