import { sha256Hex } from "@/core/hash";
import { encodeXz } from "@/core/image";
import { bzip2Compress } from "./bzip2";

/**
 * Builds an Android OTA payload the way update_engine writes a full one: the CrAU header, a
 * protobuf manifest and the blob area. Partitions can be stored raw (REPLACE) or xz compressed
 * (REPLACE_XZ), which is what makes it possible to test both paths without a real OTA.
 */
export interface PayloadFixturePartition {
  name: string;
  data: Uint8Array;
  compress?: "xz" | "bz2" | "none";
}

function varint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    bytes.push(remaining > 0 ? byte | 0x80 : byte);
  } while (remaining > 0);
  return bytes;
}

function tag(field: number, wire: number): number[] {
  return varint((field << 3) | wire);
}

function bytesField(field: number, value: Uint8Array | number[]): number[] {
  const bytes = Array.from(value);
  return [...tag(field, 2), ...varint(bytes.length), ...bytes];
}

function varintField(field: number, value: number): number[] {
  return [...tag(field, 0), ...varint(value)];
}

/** The manifest stores digests as raw bytes, not as hex text. */
function hexToBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function concat(parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

function extent(startBlock: number, numBlocks: number): number[] {
  return [...varintField(1, startBlock), ...varintField(2, numBlocks)];
}

export interface PayloadFixtureOptions {
  blockSize?: number;
  minorVersion?: number;
  /** A file-level digest for each partition, so the extractor's check is exercised. */
  declarePartitionHash?: boolean;
  /** Writes another operation type, to exercise the extractor's refusals. */
  operationType?: number;
}

export async function buildPayload(
  partitions: PayloadFixturePartition[],
  options: PayloadFixtureOptions = {},
): Promise<Uint8Array> {
  const blockSize = options.blockSize ?? 4096;
  const blobs: Uint8Array[] = [];
  const partitionMessages: Uint8Array[] = [];
  let offset = 0;

  for (const partition of partitions) {
    const compress = partition.compress ?? "none";
    const blob =
      compress === "xz"
        ? await encodeXz(partition.data)
        : compress === "bz2"
          ? bzip2Compress(partition.data)
          : partition.data;
    const blobDigest = hexToBytes(await sha256Hex(blob));
    const numBlocks = Math.ceil(partition.data.length / blockSize) || 1;
    const operation = concat([
      varintField(1, options.operationType ?? (compress === "xz" ? 8 : compress === "bz2" ? 1 : 0)),
      varintField(2, offset),
      varintField(3, blob.length),
      bytesField(6, extent(0, numBlocks)),
      bytesField(8, blobDigest),
    ]);
    const info = concat([
      varintField(1, partition.data.length),
      ...(options.declarePartitionHash === false
        ? []
        : [bytesField(2, hexToBytes(await sha256Hex(partition.data)))]),
    ]);
    partitionMessages.push(
      concat([
        bytesField(1, new TextEncoder().encode(partition.name)),
        bytesField(7, info),
        bytesField(8, operation),
      ]),
    );
    blobs.push(blob);
    offset += blob.length;
  }

  const manifest = concat([
    varintField(3, blockSize),
    varintField(12, options.minorVersion ?? 0),
    ...partitionMessages.map((message) => bytesField(13, message)),
  ]);

  const header = new Uint8Array(24);
  header.set(new TextEncoder().encode("CrAU"), 0);
  const view = new DataView(header.buffer);
  view.setBigUint64(4, 2n, false);
  view.setBigUint64(12, BigInt(manifest.length), false);
  view.setUint32(20, 4, false);

  const signature = new Uint8Array(4);
  const total = blobs.reduce((sum, blob) => sum + blob.length, 0);
  const out = new Uint8Array(24 + manifest.length + signature.length + total);
  out.set(header, 0);
  out.set(manifest, 24);
  out.set(signature, 24 + manifest.length);
  let cursor = 24 + manifest.length + signature.length;
  for (const blob of blobs) {
    out.set(blob, cursor);
    cursor += blob.length;
  }
  return out;
}
