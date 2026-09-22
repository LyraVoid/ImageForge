import { PackageError } from "../errors";
import { loadWasmModule } from "../../wasm/loader";
import type { ByteSource } from "../package/source";

/**
 * Android sparse images, from AOSP's `libsparse/sparse_format.h`
 * (system/core @ android-16.0.0_r1): a 28 byte header, then chunks of 12 byte header plus data.
 *
 *     magic 0xED26FF3A | major u16 | minor u16 | file header size u16 | chunk header size u16
 *     block size u32 | total blocks u32 | total chunks u32 | image CRC32 u32
 *
 * A chunk is RAW (its own bytes), FILL (one 4 byte value repeated), DONT_CARE (zeros) or CRC32 (an
 * integrity chunk that carries no output). Unpacking rebuilds the image the sparse file stands for.
 */
export const SPARSE_MAGIC = 0xed26ff3a;
export const SPARSE_HEADER_SIZE = 28;
export const SPARSE_CHUNK_HEADER_SIZE = 12;

export const CHUNK_TYPE_RAW = 0xcac1;
export const CHUNK_TYPE_FILL = 0xcac2;
export const CHUNK_TYPE_DONT_CARE = 0xcac3;
export const CHUNK_TYPE_CRC32 = 0xcac4;

const CHUNK_NAME: Record<number, string> = {
  [CHUNK_TYPE_RAW]: "RAW",
  [CHUNK_TYPE_FILL]: "FILL",
  [CHUNK_TYPE_DONT_CARE]: "DONT_CARE",
  [CHUNK_TYPE_CRC32]: "CRC32",
};

export interface SparseHeader {
  majorVersion: number;
  minorVersion: number;
  fileHeaderSize: number;
  chunkHeaderSize: number;
  blockSize: number;
  totalBlocks: number;
  totalChunks: number;
  imageChecksum: number;
}

export interface SparseChunk {
  type: number;
  typeName: string;
  /** Where this chunk starts in the unpacked image, in blocks. */
  startBlock: number;
  blockCount: number;
  /** Where the chunk's data is in the sparse file. */
  dataOffset: number;
  dataLength: number;
  /** FILL chunks carry the 4 byte pattern to repeat. */
  fillValue?: number;
  /** CRC32 chunks carry a checksum of the output up to this point. */
  crc32?: number;
}

export interface ParsedSparse {
  header: SparseHeader;
  chunks: SparseChunk[];
  /** Size of the image this file unpacks to. */
  sizeBytes: number;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export async function parseSparse(source: ByteSource): Promise<ParsedSparse> {
  if (source.size < SPARSE_HEADER_SIZE) {
    throw new PackageError(
      "A sparse header is " + SPARSE_HEADER_SIZE + " bytes; this file is " + source.size + ".",
      "This file is too short to be a sparse image.",
    );
  }
  const headerBytes = await source.read(0, SPARSE_HEADER_SIZE);
  if (readU32(headerBytes, 0) !== SPARSE_MAGIC) {
    throw new PackageError(
      "The magic is 0x" + readU32(headerBytes, 0).toString(16) + ", not 0xed26ff3a.",
      "This is not an Android sparse image.",
    );
  }
  const header: SparseHeader = {
    majorVersion: readU16(headerBytes, 4),
    minorVersion: readU16(headerBytes, 6),
    fileHeaderSize: readU16(headerBytes, 8),
    chunkHeaderSize: readU16(headerBytes, 10),
    blockSize: readU32(headerBytes, 12),
    totalBlocks: readU32(headerBytes, 16),
    totalChunks: readU32(headerBytes, 20),
    imageChecksum: readU32(headerBytes, 24),
  };
  if (header.majorVersion > 1) {
    throw new PackageError(
      "Sparse major version " + header.majorVersion + " is newer than the format this build reads (1).",
      "This sparse image uses a version this build does not know.",
    );
  }
  if (header.fileHeaderSize < SPARSE_HEADER_SIZE || header.chunkHeaderSize < SPARSE_CHUNK_HEADER_SIZE) {
    throw new PackageError(
      "The header sizes are " + header.fileHeaderSize + "/" + header.chunkHeaderSize + " bytes.",
      "This sparse image is damaged.",
    );
  }
  if (header.blockSize === 0 || header.blockSize % 4 !== 0) {
    throw new PackageError(
      "The sparse block size is " + header.blockSize + ", which is not a multiple of 4.",
      "This sparse image is damaged.",
    );
  }

  const chunks: SparseChunk[] = [];
  let cursor = header.fileHeaderSize;
  let startBlock = 0;
  for (let index = 0; index < header.totalChunks; index += 1) {
    const chunkHeader = await source.read(cursor, header.chunkHeaderSize);
    if (chunkHeader.length < header.chunkHeaderSize) {
      throw new PackageError(
        "Chunk " + (index + 1) + " of " + header.totalChunks + " starts past the end of the file.",
        "This sparse image is truncated.",
      );
    }
    const type = readU16(chunkHeader, 0);
    const blockCount = readU32(chunkHeader, 4);
    const totalSize = readU32(chunkHeader, 8);
    if (totalSize < header.chunkHeaderSize || cursor + totalSize > source.size) {
      throw new PackageError(
        "Chunk " + (index + 1) + " claims " + totalSize + " bytes at " + cursor + ".",
        "This sparse image is damaged.",
      );
    }
    const dataOffset = cursor + header.chunkHeaderSize;
    const dataLength = totalSize - header.chunkHeaderSize;
    const chunk: SparseChunk = {
      type,
      typeName: CHUNK_NAME[type] ?? "UNKNOWN(0x" + type.toString(16) + ")",
      startBlock,
      blockCount,
      dataOffset,
      dataLength,
    };
    if (type === CHUNK_TYPE_FILL) {
      if (dataLength < 4) {
        throw new PackageError("A FILL chunk carries " + dataLength + " bytes.", "This sparse image is damaged.");
      }
      chunk.fillValue = readU32(await source.read(dataOffset, 4), 0);
    } else if (type === CHUNK_TYPE_CRC32) {
      chunk.crc32 = readU32(await source.read(dataOffset, 4), 0);
    }
    chunks.push(chunk);
    // CRC32 chunks do not advance the output position, every other kind does.
    if (type !== CHUNK_TYPE_CRC32) startBlock += blockCount;
    cursor += totalSize;
  }

  return {
    header,
    chunks,
    sizeBytes: header.totalBlocks * header.blockSize,
  };
}

/** Unpacks the image the sparse file stands for. Refuses an output that will not fit in memory. */
export async function unpackSparse(
  source: ByteSource,
  parsed: ParsedSparse,
  options: { limit?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<Uint8Array> {
  const limit = options.limit ?? 1024 * 1024 * 1024;
  if (parsed.sizeBytes > limit) {
    throw new PackageError(
      "The image is " + parsed.sizeBytes + " bytes, above the " + limit + " byte limit for unpacking.",
      "This image is too large to unpack into memory; open it as a partition image instead.",
    );
  }
  const output = new Uint8Array(parsed.sizeBytes);
  const blockSize = parsed.header.blockSize;

  for (const chunk of parsed.chunks) {
    const at = chunk.startBlock * blockSize;
    const length = chunk.blockCount * blockSize;
    if (at + length > output.length) {
      throw new PackageError(
        "Chunk " + chunk.typeName + " writes past the end of the unpacked image.",
        "This sparse image is damaged.",
      );
    }
    if (chunk.type === CHUNK_TYPE_RAW) {
      const data = await source.read(chunk.dataOffset, length);
      if (data.length !== length) {
        throw new PackageError(
          "A RAW chunk claims " + length + " bytes but only " + data.length + " were read.",
          "This sparse image is truncated.",
        );
      }
      output.set(data, at);
    } else if (chunk.type === CHUNK_TYPE_FILL) {
      const value = chunk.fillValue ?? 0;
      const pattern = new Uint8Array(4);
      new DataView(pattern.buffer).setUint32(0, value >>> 0, true);
      for (let index = 0; index < length; index += 4) output.set(pattern, at + index);
    }
    // DONT_CARE and CRC32 write nothing: the buffer is already zeroed.
    options.onProgress?.(at + length, output.length);
  }

  if (parsed.header.imageChecksum !== 0) {
    const wasm = await loadWasmModule();
    const actual = wasm.crc32(output) >>> 0;
    if (actual !== parsed.header.imageChecksum) {
      throw new PackageError(
        "The unpacked image hashes to 0x" +
          actual.toString(16) +
          " instead of 0x" +
          parsed.header.imageChecksum.toString(16) +
          ".",
        "This sparse image is damaged: its checksum does not match.",
      );
    }
  }
  return output;
}
