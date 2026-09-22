import { crc32 } from "@/wasm/fallback";

/**
 * Builds an Android sparse image the way `img2simg` does (libsparse/sparse_format.h): a 28 byte
 * header, then RAW, FILL and DONT_CARE chunks. The header's image checksum counts don't-care blocks
 * as zeros, so an unpacked image can be checked against it.
 */
export interface SparseFixtureChunk {
  type: "raw" | "fill" | "dont-care";
  /** For RAW: the bytes, which must fill blockCount blocks. For FILL: the 4 byte pattern. */
  data?: Uint8Array;
  fillValue?: number;
  blockCount: number;
}

export function sparseBlockCount(chunks: SparseFixtureChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.blockCount, 0);
}

/** The image the sparse fixture stands for. */
export function sparseExpected(chunks: SparseFixtureChunk[], blockSize = 4096): Uint8Array {
  const out = new Uint8Array(sparseBlockCount(chunks) * blockSize);
  let at = 0;
  for (const chunk of chunks) {
    const size = chunk.blockCount * blockSize;
    if (chunk.type === "raw" && chunk.data) out.set(chunk.data.subarray(0, size), at);
    if (chunk.type === "fill") {
      const pattern = new Uint8Array(4);
      new DataView(pattern.buffer).setUint32(0, (chunk.fillValue ?? 0) >>> 0, true);
      for (let index = 0; index < size; index += 4) out.set(pattern, at + index);
    }
    at += size;
  }
  return out;
}

export function buildSparse(chunks: SparseFixtureChunk[], blockSize = 4096): Uint8Array {
  const header = new Uint8Array(28);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0xed26ff3a, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 28, true);
  view.setUint16(10, 12, true);
  view.setUint32(12, blockSize, true);
  view.setUint32(16, sparseBlockCount(chunks), true);
  view.setUint32(20, chunks.length, true);
  view.setUint32(24, crc32(sparseExpected(chunks, blockSize)) >>> 0, true);

  const parts: Uint8Array[] = [header];
  for (const chunk of chunks) {
    const data =
      chunk.type === "raw"
        ? (chunk.data ?? new Uint8Array(0)).subarray(0, chunk.blockCount * blockSize)
        : chunk.type === "fill"
          ? (() => {
              const pattern = new Uint8Array(4);
              new DataView(pattern.buffer).setUint32(0, (chunk.fillValue ?? 0) >>> 0, true);
              return pattern;
            })()
          : new Uint8Array(0);
    const chunkHeader = new Uint8Array(12);
    const chunkView = new DataView(chunkHeader.buffer);
    chunkView.setUint16(0, chunk.type === "raw" ? 0xcac1 : chunk.type === "fill" ? 0xcac2 : 0xcac3, true);
    chunkView.setUint32(4, chunk.blockCount, true);
    chunkView.setUint32(8, 12 + data.length, true);
    parts.push(chunkHeader, data);
  }

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}
