import { startsWith } from "../binary";

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

const SUPPORTED: readonly CompressionFormat[] = ["none", "cpio", "gzip"];

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

export async function decompress(bytes: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  if (format === "none" || format === "cpio" || format === "unknown") return bytes;
  if (format !== "gzip") {
    throw new Error("Decompression for " + COMPRESSION_LABEL[format] + " is not available in this build.");
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is not available in this runtime.");
  }
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function compressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream is not available in this runtime.");
  }
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
