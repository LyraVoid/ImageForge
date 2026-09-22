import { PackageError } from "../errors";
import { decodeBzip2 } from "../image/bzip2";
import { decodeXz } from "../image/xz";
import type { ByteSource } from "./source";
import { OPERATION_TYPE } from "./payload";
import type { ParsedPayload, PayloadOperation } from "./payload";

/**
 * A partition inside an OTA payload, as a {@link ByteSource} of its own.
 *
 * A payload stores a partition as a run of operations, each a compressed blob that fills a set of
 * extents. Reading a boot image means materializing all of them, but *browsing* a filesystem means
 * touching a few hundred kilobytes in a handful of places: the superblock, some tables, a directory
 * block. This source maps a logical offset onto the operation that covers it, decodes that operation
 * on demand (keeping a bounded cache) and hands back only what was asked for — so a 759 MB `system`
 * image can be listed and read without ever existing as one buffer.
 */
export interface PayloadSourceOptions {
  /** How many decoded operation bytes to keep. Operations are a few megabytes each. */
  cacheBytes?: number;
  onDecode?: (compressedBytes: number, decodedBytes: number, cachedBytes: number) => void;
}

interface Segment {
  logicalStart: number;
  logicalEnd: number;
  /** Index into the partition's operation list, or -1 for a hole (ZERO / DISCARD). */
  operationIndex: number;
  /** Where this segment starts inside the operation's decoded data. */
  sourceOffset: number;
}

export interface PayloadPartitionSource extends ByteSource {
  /** How many operations had to be decoded, and how many bytes that was. */
  readonly stats: { decodes: number; decodedBytes: number; cachedBytes: number };
}

const DEFAULT_CACHE_BYTES = 32 * 1024 * 1024;

export function payloadPartitionSource(
  source: ByteSource,
  payload: ParsedPayload,
  partitionName: string,
  options: PayloadSourceOptions = {},
): PayloadPartitionSource {
  const partition = payload.partitions.find((entry) => entry.name === partitionName);
  if (!partition) {
    throw new PackageError(
      "The payload has no partition named " + partitionName + ".",
      "This payload has no partition called " + partitionName + ".",
    );
  }
  if (partition.requiresSource) {
    throw new PackageError(
      "Partition " + partitionName + " needs the image it was generated against.",
      partitionName + " is stored as a delta, so it cannot be read from this payload alone.",
    );
  }

  const blockSize = payload.blockSize;
  const operations = partition.operations;
  const segments: Segment[] = [];
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    let sourceOffset = 0;
    for (const extent of operation.dstExtents) {
      const size = extent.numBlocks * blockSize;
      const logicalStart = extent.startBlock * blockSize;
      segments.push({
        logicalStart,
        logicalEnd: logicalStart + size,
        operationIndex: operation.type === 6 || operation.type === 7 ? -1 : index,
        sourceOffset,
      });
      sourceOffset += size;
    }
  }
  segments.sort((left, right) => left.logicalStart - right.logicalStart);

  const cacheLimit = options.cacheBytes ?? DEFAULT_CACHE_BYTES;
  const cache = new Map<number, Uint8Array>();
  const stats = { decodes: 0, decodedBytes: 0, cachedBytes: 0 };

  const decodedOperation = async (index: number): Promise<Uint8Array> => {
    const cached = cache.get(index);
    if (cached) {
      // refresh the LRU order
      cache.delete(index);
      cache.set(index, cached);
      return cached;
    }
    const operation: PayloadOperation = operations[index];
    const start = payload.dataOffset + operation.dataOffset;
    const blob = await source.read(start, operation.dataLength);
    if (blob.length !== operation.dataLength) {
      throw new PackageError(
        "Operation " + operation.typeName + " of " + partitionName + " is past the end of the payload.",
        "This payload is truncated.",
      );
    }
    let decoded: Uint8Array;
    if (operation.type === 0) decoded = blob;
    else if (operation.type === 8) decoded = await decodeXz(blob);
    else if (operation.type === 1) {
      const capacity = operation.dstExtents.reduce((sum, extent) => sum + extent.numBlocks * blockSize, 0);
      decoded = await decodeBzip2(blob, capacity);
    } else {
      throw new PackageError(
        "Operation " + operation.typeName + " has no decoder here.",
        "This partition is stored as " + operation.typeName + ", which this build cannot read.",
      );
    }
    stats.decodes += 1;
    stats.decodedBytes += decoded.length;
    cache.set(index, decoded);
    stats.cachedBytes += decoded.length;
    while (stats.cachedBytes > cacheLimit && cache.size > 1) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      const evicted = cache.get(oldest.value);
      cache.delete(oldest.value);
      stats.cachedBytes -= evicted ? evicted.length : 0;
    }
    options.onDecode?.(operation.dataLength, decoded.length, stats.cachedBytes);
    return decoded;
  };

  const sizeBytes = partition.sizeBytes;

  return {
    size: sizeBytes,
    stats,
    read: async (offset, length) => {
      const start = Math.max(0, Math.min(offset, sizeBytes));
      const end = Math.max(start, Math.min(start + length, sizeBytes));
      const out = new Uint8Array(end - start);
      if (end === start) return out;

      for (const segment of segments) {
        if (segment.logicalEnd <= start) continue;
        if (segment.logicalStart >= end) break;
        const from = Math.max(start, segment.logicalStart);
        const to = Math.min(end, segment.logicalEnd);
        if (segment.operationIndex < 0) continue; // a hole stays zero
        const decoded = await decodedOperation(segment.operationIndex);
        const sourceStart = segment.sourceOffset + (from - segment.logicalStart);
        const take = Math.min(to - from, decoded.length - sourceStart);
        if (take <= 0) continue;
        out.set(decoded.subarray(sourceStart, sourceStart + take), from - start);
      }
      return out;
    },
  };
}

/** The operation types this source can decode, for a caller that wants to check before offering it. */
export function payloadSupportsOperation(type: number): boolean {
  return type === 0 || type === 1 || type === 6 || type === 7 || type === 8;
}

export function describeOperationTypes(payload: ParsedPayload, partitionName: string): string[] {
  const partition = payload.partitions.find((entry) => entry.name === partitionName);
  if (!partition) return [];
  return [...new Set(partition.operations.map((operation) => OPERATION_TYPE[operation.type] ?? String(operation.type)))];
}
