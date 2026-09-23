import { PackageError } from "../errors";
import { decodeBzip2 } from "../image/bzip2";
import { decodeXz } from "../image/xz";
import type { ByteSource } from "./source";
import type { ParsedPayload, PayloadOperation } from "./payload";
import { LP_SECTOR_SIZE, LP_TARGET_TYPE_LINEAR, LP_TARGET_TYPE_ZERO } from "../partition/lp";
import type { ParsedSuper } from "../partition/lp";

/**
 * Partitions as streams, for the ones that are too big to hold: a 3 GiB `my_stock` cannot be a
 * `Uint8Array` in a browser, but it can be produced operation by operation and handed on as a
 * `Blob` or a download, one decompressed operation at a time.
 *
 * `payloadPartitionStream` walks the extents in logical order and decodes only the operation each
 * piece of the partition belongs to, so the peak is one operation (a couple of megabytes) rather
 * than the partition. `logicalPartitionStream` does the same for one partition of a super image,
 * reading its extents in fixed size chunks.
 */
const ZERO_CHUNK = 1024 * 1024;

export interface PartitionSegment {
  logicalStart: number;
  logicalEnd: number;
  /** Index into the partition's operations, or -1 for a hole. */
  operationIndex: number;
  /** Where this segment starts inside the operation's decoded data. */
  sourceOffset: number;
}

/** The segments of one payload partition, in logical order. */
export function partitionSegments(payload: ParsedPayload, partitionName: string): PartitionSegment[] {
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
  const segments: PartitionSegment[] = [];
  partition.operations.forEach((operation: PayloadOperation, index: number) => {
    let sourceOffset = 0;
    for (const extent of operation.dstExtents) {
      const size = extent.numBlocks * payload.blockSize;
      const logicalStart = extent.startBlock * payload.blockSize;
      segments.push({
        logicalStart,
        logicalEnd: logicalStart + size,
        operationIndex: operation.type === 6 || operation.type === 7 ? -1 : index,
        sourceOffset,
      });
      sourceOffset += size;
    }
  });
  return segments.sort((left, right) => left.logicalStart - right.logicalStart);
}

/** Decodes one operation of a payload partition, exactly as the materializing reader does. */
export async function decodePayloadOperation(
  source: ByteSource,
  payload: ParsedPayload,
  partitionName: string,
  operationIndex: number,
): Promise<Uint8Array> {
  const partition = payload.partitions.find((entry) => entry.name === partitionName);
  const operation = partition?.operations[operationIndex];
  if (!operation) {
    throw new PackageError("The partition has no operation " + operationIndex + ".", "This payload is damaged.");
  }
  const blob = await source.read(payload.dataOffset + operation.dataOffset, operation.dataLength);
  if (blob.length !== operation.dataLength) {
    throw new PackageError(
      "Operation " + operation.typeName + " is past the end of the payload.",
      "This payload is truncated.",
    );
  }
  if (operation.type === 0) return blob;
  if (operation.type === 8) return decodeXz(blob);
  if (operation.type === 1) {
    const capacity = operation.dstExtents.reduce((sum, extent) => sum + extent.numBlocks * payload.blockSize, 0);
    return decodeBzip2(blob, capacity);
  }
  throw new PackageError(
    "Operation " + operation.typeName + " has no decoder here.",
    "This partition is stored as " + operation.typeName + ", which this build cannot read.",
  );
}

/** A partition of a payload as a stream, one operation decoded at a time. */
export function payloadPartitionStream(
  source: ByteSource,
  payload: ParsedPayload,
  partitionName: string,
): ReadableStream<Uint8Array> {
  const partition = payload.partitions.find((entry) => entry.name === partitionName);
  if (!partition) {
    throw new PackageError(
      "The payload has no partition named " + partitionName + ".",
      "This payload has no partition called " + partitionName + ".",
    );
  }
  const segments = partitionSegments(payload, partitionName);
  let index = 0;
  let cachedOperationIndex = -1;
  let cachedOperation: Uint8Array | null = null;
  let zeroRemaining = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (zeroRemaining > 0) {
        const size = Math.min(zeroRemaining, ZERO_CHUNK);
        zeroRemaining -= size;
        controller.enqueue(new Uint8Array(size));
        return;
      }
      while (index < segments.length) {
        const segment = segments[index];
        const length = segment.logicalEnd - segment.logicalStart;
        if (segment.operationIndex < 0) {
          index += 1;
          zeroRemaining = length - Math.min(length, ZERO_CHUNK);
          controller.enqueue(new Uint8Array(Math.min(length, ZERO_CHUNK)));
          return;
        }
        if (cachedOperationIndex !== segment.operationIndex) {
          cachedOperation = await decodePayloadOperation(source, payload, partitionName, segment.operationIndex);
          cachedOperationIndex = segment.operationIndex;
        }
        const data = (cachedOperation as Uint8Array).subarray(
          segment.sourceOffset,
          segment.sourceOffset + length,
        );
        index += 1;
        controller.enqueue(data);
        return;
      }
      controller.close();
    },
  });
}

/** One logical partition of a super image as a stream, read in fixed size chunks. */
export function logicalPartitionStream(
  source: ByteSource,
  parsed: ParsedSuper,
  partitionName: string,
  chunkBytes = 4 * 1024 * 1024,
): ReadableStream<Uint8Array> {
  const partition = parsed.partitions.find((entry) => entry.name === partitionName);
  if (!partition) {
    throw new PackageError(
      "The metadata has no partition named " + partitionName + ".",
      "This super image has no partition called " + partitionName + ".",
    );
  }
  const starts: number[] = [];
  let total = 0;
  for (const extent of partition.extents) {
    starts.push(total);
    total += extent.numSectors * LP_SECTOR_SIZE;
  }
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= total) {
        controller.close();
        return;
      }
      const length = Math.min(chunkBytes, total - offset);
      const chunk = new Uint8Array(length);
      for (let extentIndex = 0; extentIndex < partition.extents.length; extentIndex += 1) {
        const extent = partition.extents[extentIndex];
        const extentStart = starts[extentIndex];
        const extentSize = extent.numSectors * LP_SECTOR_SIZE;
        if (extentStart >= offset + length || extentStart + extentSize <= offset) continue;
        const from = Math.max(offset, extentStart) - extentStart;
        const to = Math.min(offset + length, extentStart + extentSize) - extentStart;
        if (extent.targetType === LP_TARGET_TYPE_ZERO) continue;
        if (extent.targetType !== LP_TARGET_TYPE_LINEAR || extent.targetSource !== 0) {
          throw new PackageError(
            "Extent " + extentIndex + " of " + partitionName + " is not a plain linear mapping.",
            "This logical partition cannot be read by this build.",
          );
        }
        const data = await source.read(extent.targetData * LP_SECTOR_SIZE + from, to - from);
        chunk.set(data, extentStart - offset + from);
      }
      offset += length;
      controller.enqueue(chunk);
    },
  });
}
