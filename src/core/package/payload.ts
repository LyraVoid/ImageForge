import { PackageError } from "../errors";
import { sha256Hex } from "../hash";
import { decodeXz } from "../image/xz";
import { ProtoReader, WIRE_LENGTH_DELIMITED, WIRE_VARINT } from "./protobuf";

/**
 * The Android OTA payload format, as magiskboot reads it
 * (`native/src/boot/payload.rs`, and the schema in `native/src/boot/proto/update_metadata.proto`):
 *
 *     "CrAU" | version u64 | manifest size u64 | manifest signature size u32 | manifest | signature | blobs
 *
 * Only full payloads are interesting here: a delta payload describes operations against a source
 * image the user would have to provide, so it is refused rather than half applied.
 */
export const PAYLOAD_MAGIC = "CrAU";

/** The operation types of `InstallOperation.Type` (update_metadata.proto:136). */
export const OPERATION_TYPE: Record<number, string> = {
  0: "REPLACE",
  1: "REPLACE_BZ",
  2: "MOVE",
  3: "BSDIFF",
  4: "SOURCE_COPY",
  5: "SOURCE_BSDIFF",
  6: "ZERO",
  7: "DISCARD",
  8: "REPLACE_XZ",
  9: "PUFFDIFF",
  10: "BROTLI_BSDIFF",
  11: "ZUCCHINI",
  12: "LZ4DIFF_BSDIFF",
  13: "LZ4DIFF_PUFFDIFF",
};

export interface PayloadExtent {
  startBlock: number;
  numBlocks: number;
}

export interface PayloadOperation {
  type: number;
  typeName: string;
  dataOffset: number;
  dataLength: number;
  dstExtents: PayloadExtent[];
  dataSha256: Uint8Array | null;
}

export interface PayloadPartition {
  name: string;
  sizeBytes: number;
  declaredSha256: Uint8Array | null;
  operations: PayloadOperation[];
}

export interface ParsedPayload {
  version: number;
  minorVersion: number;
  blockSize: number;
  manifestSize: number;
  manifestSignatureSize: number;
  /** Where the blob area starts: every `data_offset` is relative to this. */
  dataOffset: number;
  partitions: PayloadPartition[];
}

function readBigEndianU64(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return value;
}

function readBigEndianU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseExtent(bytes: Uint8Array): PayloadExtent {
  const reader = new ProtoReader(bytes);
  let startBlock = 0;
  let numBlocks = 0;
  while (!reader.done) {
    const tag = reader.readTag();
    if (tag.wire !== WIRE_VARINT) {
      reader.skip(tag.wire);
      continue;
    }
    const value = Number(reader.readVarint());
    if (tag.field === 1) startBlock = value;
    else if (tag.field === 2) numBlocks = value;
  }
  return { startBlock, numBlocks };
}

function parseOperation(bytes: Uint8Array): PayloadOperation {
  const reader = new ProtoReader(bytes);
  const operation: PayloadOperation = {
    type: 0,
    typeName: OPERATION_TYPE[0],
    dataOffset: 0,
    dataLength: 0,
    dstExtents: [],
    dataSha256: null,
  };
  while (!reader.done) {
    const tag = reader.readTag();
    if (tag.wire === WIRE_VARINT) {
      const value = reader.readVarint();
      if (tag.field === 1) {
        operation.type = Number(value);
        operation.typeName = OPERATION_TYPE[operation.type] ?? "UNKNOWN(" + operation.type + ")";
      } else if (tag.field === 2) operation.dataOffset = Number(value);
      else if (tag.field === 3) operation.dataLength = Number(value);
      continue;
    }
    if (tag.wire === WIRE_LENGTH_DELIMITED) {
      const value = reader.readLengthDelimited();
      if (tag.field === 6) operation.dstExtents.push(parseExtent(value));
      else if (tag.field === 8 && value.length > 0) operation.dataSha256 = value;
      continue;
    }
    reader.skip(tag.wire);
  }
  return operation;
}

function parsePartition(bytes: Uint8Array): PayloadPartition {
  const reader = new ProtoReader(bytes);
  const partition: PayloadPartition = {
    name: "",
    sizeBytes: 0,
    declaredSha256: null,
    operations: [],
  };
  while (!reader.done) {
    const tag = reader.readTag();
    if (tag.wire === WIRE_LENGTH_DELIMITED) {
      const value = reader.readLengthDelimited();
      if (tag.field === 1) partition.name = new TextDecoder().decode(value);
      else if (tag.field === 7) {
        // PartitionInfo: 1 = size, 2 = hash
        const info = new ProtoReader(value);
        while (!info.done) {
          const infoTag = info.readTag();
          if (infoTag.wire === WIRE_VARINT && infoTag.field === 1) {
            partition.sizeBytes = Number(info.readVarint());
          } else if (infoTag.wire === WIRE_LENGTH_DELIMITED && infoTag.field === 2) {
            partition.declaredSha256 = info.readLengthDelimited();
          } else info.skip(infoTag.wire);
        }
      } else if (tag.field === 8) partition.operations.push(parseOperation(value));
      continue;
    }
    reader.skip(tag.wire);
  }
  return partition;
}

export function parsePayload(bytes: Uint8Array): ParsedPayload {
  if (bytes.length < 24) {
    throw new PackageError(
      "A payload header is 24 bytes; this file is " + bytes.length + ".",
      "This file is too short to be an Android OTA payload.",
    );
  }
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== PAYLOAD_MAGIC) {
    throw new PackageError(
      'The file starts with "' + magic + '", not "' + PAYLOAD_MAGIC + '".',
      "This is not an Android OTA payload file.",
    );
  }
  const version = Number(readBigEndianU64(bytes, 4));
  if (version !== 2) {
    throw new PackageError(
      "Payload version " + version + " is not supported.",
      "This build reads Android OTA payloads of version 2.",
    );
  }
  const manifestSize = Number(readBigEndianU64(bytes, 12));
  const manifestSignatureSize = readBigEndianU32(bytes, 20);
  if (manifestSize === 0) {
    throw new PackageError("The manifest length field is zero.", "This payload has no manifest.");
  }
  const manifestStart = 24;
  const manifestEnd = manifestStart + manifestSize;
  if (manifestEnd > bytes.length) {
    throw new PackageError(
      "The manifest claims " + manifestSize + " bytes but only " + (bytes.length - manifestStart) + " remain.",
      "This payload is truncated.",
    );
  }
  const manifest = bytes.subarray(manifestStart, manifestEnd);

  const payload: ParsedPayload = {
    version,
    minorVersion: 0,
    blockSize: 4096,
    manifestSize,
    manifestSignatureSize,
    dataOffset: manifestEnd + manifestSignatureSize,
    partitions: [],
  };

  const reader = new ProtoReader(manifest);
  while (!reader.done) {
    const tag = reader.readTag();
    if (tag.wire === WIRE_VARINT) {
      const value = reader.readVarint();
      if (tag.field === 3) payload.blockSize = Number(value);
      else if (tag.field === 12) payload.minorVersion = Number(value);
      continue;
    }
    if (tag.wire === WIRE_LENGTH_DELIMITED) {
      const value = reader.readLengthDelimited();
      if (tag.field === 13) payload.partitions.push(parsePartition(value));
      continue;
    }
    reader.skip(tag.wire);
  }

  if (payload.minorVersion !== 0) {
    throw new PackageError(
      "The manifest declares minor version " + payload.minorVersion + ", which means a delta payload.",
      "Only full OTA payloads can be read: a delta payload describes changes against an image this tool does not have.",
    );
  }
  if (payload.partitions.length === 0) {
    throw new PackageError("The manifest lists no partitions.", "This payload describes no partitions.");
  }
  for (const partition of payload.partitions) {
    if (partition.sizeBytes === 0) {
      // Some payloads leave the size out and rely on the extents; take the highest block written.
      let end = 0;
      for (const operation of partition.operations) {
        for (const extent of operation.dstExtents) {
          end = Math.max(end, (extent.startBlock + extent.numBlocks) * payload.blockSize);
        }
      }
      partition.sizeBytes = end;
    }
  }
  return payload;
}

/** Writes the decompressed operation payload into the extents it claims. */
function writeExtents(
  output: Uint8Array,
  extents: PayloadExtent[],
  data: Uint8Array,
  blockSize: number,
  operation: PayloadOperation,
): void {
  let written = 0;
  for (const extent of extents) {
    const capacity = extent.numBlocks * blockSize;
    const take = Math.min(capacity, data.length - written);
    if (take <= 0) break;
    const start = extent.startBlock * blockSize;
    if (start + take > output.length) {
      throw new PackageError(
        "Operation " + operation.typeName + " writes to " + (start + take) + " bytes, past the end of the partition.",
        "This payload describes an operation outside its partition.",
      );
    }
    output.set(data.subarray(written, written + take), start);
    written += take;
  }
  if (written !== data.length) {
    throw new PackageError(
      "Operation " +
        operation.typeName +
        " carries " +
        data.length +
        " bytes but its extents take " +
        written +
        ".",
      "This payload's operations do not add up to its partitions.",
    );
  }
}

/**
 * Rebuilds one partition. Operations are applied in blob order, which is how the payload stores
 * them, and every blob is checked against the digest the manifest declares for it.
 */
export async function extractPayloadPartition(
  bytes: Uint8Array,
  payload: ParsedPayload,
  partitionName: string,
): Promise<Uint8Array> {
  const partition = payload.partitions.find((entry) => entry.name === partitionName);
  if (!partition) {
    throw new PackageError(
      "The payload has no partition named " +
        partitionName +
        "; it has " +
        payload.partitions.map((entry) => entry.name).join(", ") +
        ".",
      "This payload has no partition called " + partitionName + ".",
    );
  }
  const output = new Uint8Array(partition.sizeBytes);
  const operations = [...partition.operations].sort((left, right) => left.dataOffset - right.dataOffset);

  for (const operation of operations) {
    if (operation.type === 6 || operation.type === 7) continue; // ZERO / DISCARD: the buffer is zeroed
    const start = payload.dataOffset + operation.dataOffset;
    const blob = bytes.subarray(start, start + operation.dataLength);
    if (blob.length !== operation.dataLength) {
      throw new PackageError(
        "Operation " +
          operation.typeName +
          " claims " +
          operation.dataLength +
          " bytes at " +
          start +
          " but only " +
          blob.length +
          " remain.",
        "This payload is truncated.",
      );
    }
    if (operation.dataSha256) {
      const digest = await sha256Hex(blob);
      const declared = hex(operation.dataSha256);
      if (digest !== declared) {
        throw new PackageError(
          "A blob of " +
            partitionName +
            " hashes to " +
            digest.slice(0, 16) +
            " instead of " +
            declared.slice(0, 16) +
            ".",
          "This payload is damaged: one of its data blobs does not match its digest.",
        );
      }
    }

    if (operation.type === 0) {
      writeExtents(output, operation.dstExtents, blob, payload.blockSize, operation);
      continue;
    }
    if (operation.type === 8) {
      let expanded: Uint8Array;
      try {
        expanded = await decodeXz(blob);
      } catch (error) {
        throw new PackageError(
          "The xz stream of " +
            partitionName +
            " could not be expanded: " +
            (error instanceof Error ? error.message : String(error)),
          "This payload is damaged: a compressed partition stream could not be expanded.",
        );
      }
      writeExtents(output, operation.dstExtents, expanded, payload.blockSize, operation);
      continue;
    }
    throw new PackageError(
      "Operation type " + operation.type + " (" + operation.typeName + ") has no decoder here.",
      "This payload stores " +
        partitionName +
        " as " +
        operation.typeName +
        ", which this build cannot read yet.",
    );
  }

  if (partition.declaredSha256) {
    const digest = await sha256Hex(output);
    const declared = hex(partition.declaredSha256);
    if (digest !== declared) {
      throw new PackageError(
        partitionName + " hashes to " + digest.slice(0, 16) + " instead of " + declared.slice(0, 16) + ".",
        "This payload is damaged: the rebuilt partition does not match its digest.",
      );
    }
  }
  return output;
}
