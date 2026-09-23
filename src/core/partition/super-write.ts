import { PackageError } from "../errors";
import type { ByteSource } from "../package/source";
import { sha256Hex } from "../hash";

/**
 * Builds a super image, the container Android's dynamic partitions live in, from a set of partition
 * images. The output is written the way AOSP's lpmake writes it, so the two can be compared byte for
 * byte (the tests do exactly that with the real tool):
 *
 *   0x0000                    4096 bytes of padding
 *   0x1000, 0x2000            the geometry, primary and backup (52 bytes each)
 *   0x3000 + slot * max_size  the metadata, then its backup copies
 *   first_logical_sector      the partitions, one after another, aligned
 *
 * The structures and their field order come from metadata_format.h, which is kept in
 * .research/upstream/aosp/: a 52 byte geometry with its own SHA-256, a 128 byte header with a SHA-256
 * of itself and one of the tables, and four tables (partitions, extents, groups, block devices) whose
 * descriptors hold offsets relative to the end of the header.
 */
const SECTOR_SIZE = 512;
const GEOMETRY_MAGIC = 0x616c4467;
const HEADER_MAGIC = 0x414c5030;
const GEOMETRY_SIZE = 4096;
const GEOMETRY_STRUCT_SIZE = 52;
const HEADER_SIZE = 128;
const ENTRY_SIZES = { partition: 52, extent: 24, group: 48, blockDevice: 64 };
const FRONT_PADDING = 4096;
const NAME_SIZE = 36;
/** The attributes a partition can carry; only these two are written by AOSP's tooling. */
const ATTRIBUTE_READONLY = 1;

export interface SuperPartitionInput {
  name: string;
  /** The partition's bytes. A partition can also be declared with just a size, as a super_empty does. */
  source?: ByteSource;
  sizeBytes?: number;
  /** Which group it belongs to; "default" unless a group is given. */
  group?: string;
  writable?: boolean;
}

export interface SuperPackOptions {
  /** Bytes for the whole device. Defaults to what the parts need, aligned. */
  deviceSize?: number;
  metadataSize?: number;
  metadataSlots?: number;
  blockSize?: number;
  alignment?: number;
  groups?: { name: string; maximumSize: number }[];
  superName?: string;
  /**
   * Write the metadata by itself, the compact form AOSP's tooling calls a super_empty image: no
   * partition data at all, just the geometry at offset 0 and the metadata at 4096. That is what
   * fastboot takes when a device's dynamic partitions are set up, and lpmake produces it when it is
   * given partition sizes without images.
   */
  metadataOnly?: boolean;
}

interface Placed {
  name: string;
  attributes: number;
  groupIndex: number;
  sizeBytes: number;
  startSector: number;
  /** Absent for a partition that is only declared, as in a super_empty image. */
  source?: ByteSource;
}

type Piece = { kind: "zeros"; length: number } | { kind: "source"; source: ByteSource; offset: number; length: number };

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function checkName(name: string, what: string): void {
  if (name.length === 0 || name.length >= NAME_SIZE || !/^[A-Za-z0-9_]+$/.test(name)) {
    throw new PackageError(
      "The " + what + " name " + JSON.stringify(name) + " is not usable.",
      "Names may hold letters, digits and underscores, and at most 35 of them.",
    );
  }
}

function u8(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) out[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return out;
}

/**
 * Builds a super image as a stream: the metadata is small and the partition data is copied through in
 * chunks, so packing several gigabytes needs no more memory than one chunk.
 */
export async function packSuperStream(
  partitions: SuperPartitionInput[],
  options: SuperPackOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  if (partitions.length === 0) {
    throw new PackageError("A super image with no partitions holds nothing.", "Add at least one partition.");
  }
  const blockSize = options.blockSize ?? 4096;
  const metadataSize = options.metadataSize ?? 65536;
  const metadataSlots = options.metadataSlots ?? 2;
  const alignment = options.alignment ?? 1024 * 1024;
  const superName = options.superName ?? "super";
  checkName(superName, "device");
  const names = new Set<string>();
  for (const partition of partitions) {
    checkName(partition.name, "partition");
    if (names.has(partition.name)) {
      throw new PackageError("Two partitions are called " + partition.name + ".", "Partition names have to be unique.");
    }
    names.add(partition.name);
  }

  // the reserved area: front padding, both geometries, and every copy of the metadata
  const metadataTotal = FRONT_PADDING + GEOMETRY_SIZE * 2 + metadataSize * metadataSlots * 2;
  const firstLogicalSector = alignUp(metadataTotal, alignment) / SECTOR_SIZE;

  const groupNames = ["default", ...(options.groups ?? []).map((group) => group.name).filter((name) => name !== "default")];
  for (const name of groupNames.slice(1)) checkName(name, "group");

  const bytesOfPartition = (partition: SuperPartitionInput): number =>
    partition.source?.size ?? partition.sizeBytes ?? 0;
  const placed: Placed[] = [];
  let cursor = firstLogicalSector * SECTOR_SIZE;
  for (const partition of partitions) {
    const sizeBytes = alignUp(bytesOfPartition(partition), alignment);
    placed.push({
      name: partition.name,
      attributes: partition.writable ? 0 : ATTRIBUTE_READONLY,
      groupIndex: Math.max(0, groupNames.indexOf(partition.group ?? "default")),
      sizeBytes,
      startSector: cursor / SECTOR_SIZE,
      source: partition.source,
    });
    cursor += sizeBytes;
  }
  const needed = cursor;
  const deviceSize = options.deviceSize ?? needed;
  if (!Number.isInteger(deviceSize / SECTOR_SIZE)) {
    throw new PackageError(
      "A device of " + deviceSize + " bytes is not a whole number of " + SECTOR_SIZE + " byte sectors.",
      "The device size has to be a multiple of 512.",
    );
  }
  if (deviceSize < needed) {
    throw new PackageError(
      "The partitions need " + needed + " bytes but the device is " + deviceSize + ".",
      "The device is too small for these partitions.",
    );
  }

  // tables: partitions, extents, groups, block devices, contiguous after the header
  const tablesSize =
    placed.length * ENTRY_SIZES.partition +
    placed.length * ENTRY_SIZES.extent +
    groupNames.length * ENTRY_SIZES.group +
    ENTRY_SIZES.blockDevice;
  const tables = new Uint8Array(tablesSize);
  const tableView = new DataView(tables.buffer);
  let at = 0;
  placed.forEach((partition, index) => {
    tables.set(new TextEncoder().encode(partition.name).subarray(0, NAME_SIZE - 1), at);
    tableView.setUint32(at + 36, partition.attributes, true);
    tableView.setUint32(at + 40, index, true);
    tableView.setUint32(at + 44, 1, true);
    tableView.setUint32(at + 48, partition.groupIndex, true);
    at += ENTRY_SIZES.partition;
  });
  const extentsAt = at;
  placed.forEach((partition) => {
    tableView.setBigUint64(at, BigInt(partition.sizeBytes / SECTOR_SIZE), true);
    tableView.setUint32(at + 8, 0, true); // LP_TARGET_TYPE_LINEAR
    tableView.setBigUint64(at + 12, BigInt(partition.startSector), true);
    tableView.setUint32(at + 20, 0, true); // target_source: the one block device
    at += ENTRY_SIZES.extent;
  });
  const groupsAt = at;
  groupNames.forEach((name, index) => {
    tables.set(new TextEncoder().encode(name).subarray(0, NAME_SIZE - 1), at);
    tableView.setUint32(at + 36, 0, true);
    const maximum = index === 0 ? 0 : (options.groups ?? []).find((group) => group.name === name)?.maximumSize ?? 0;
    tableView.setBigUint64(at + 40, BigInt(maximum), true);
    at += ENTRY_SIZES.group;
  });
  const devicesAt = at;
  tableView.setBigUint64(at, BigInt(firstLogicalSector), true);
  tableView.setUint32(at + 8, alignment, true);
  tableView.setUint32(at + 12, 0, true);
  tableView.setBigUint64(at + 16, BigInt(deviceSize), true);
  tables.set(new TextEncoder().encode(superName).subarray(0, NAME_SIZE - 1), at + 24);
  tableView.setUint32(at + 60, 0, true);

  const tablesChecksum = u8(await sha256Hex(tables));

  // the 52 byte struct sits at the start of a whole 4096 byte block, which is what occupies space
  const geometry = new Uint8Array(GEOMETRY_SIZE);
  const geometryView = new DataView(geometry.buffer);
  geometryView.setUint32(0, GEOMETRY_MAGIC, true);
  geometryView.setUint32(4, GEOMETRY_STRUCT_SIZE, true);
  geometryView.setUint32(40, metadataSize, true);
  geometryView.setUint32(44, metadataSlots, true);
  geometryView.setUint32(48, blockSize, true);
  // the checksum covers the struct itself, not the padding around it
  geometry.set(u8(await sha256Hex(geometry.subarray(0, GEOMETRY_STRUCT_SIZE))), 8);

  const header = new Uint8Array(HEADER_SIZE);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, HEADER_MAGIC, true);
  headerView.setUint16(4, 10, true);
  headerView.setUint16(6, 0, true);
  headerView.setUint32(8, HEADER_SIZE, true);
  headerView.setUint32(44, tablesSize, true);
  header.set(tablesChecksum, 48);
  const descriptors: [number, number, number][] = [
    [placed.length, ENTRY_SIZES.partition, 0],
    [placed.length, ENTRY_SIZES.extent, extentsAt],
    [groupNames.length, ENTRY_SIZES.group, groupsAt],
    [1, ENTRY_SIZES.blockDevice, devicesAt],
  ];
  descriptors.forEach(([entries, entrySize, offset], index) => {
    const at = 80 + index * 12;
    headerView.setUint32(at, offset, true);
    headerView.setUint32(at + 4, entries, true);
    headerView.setUint32(at + 8, entrySize, true);
  });
  header.set(u8(await sha256Hex(header)), 12);

  const metadata = new Uint8Array(metadataSize);
  metadata.set(header, 0);
  metadata.set(tables, HEADER_SIZE);

  // the compact form: the bare 52 byte geometry struct at offset 0, zeros up to 4096, then the
  // header and its tables and nothing else — which is what lpmake writes for a super_empty image
  if (options.metadataOnly) {
    const metadataBytes = new Uint8Array(HEADER_SIZE + tablesSize);
    metadataBytes.set(header, 0);
    metadataBytes.set(tables, HEADER_SIZE);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(geometry.subarray(0, GEOMETRY_STRUCT_SIZE));
        controller.enqueue(new Uint8Array(FRONT_PADDING - GEOMETRY_STRUCT_SIZE));
        controller.enqueue(metadataBytes);
        controller.close();
      },
    });
  }

  // the pieces of the image, in order
  const pieces: Piece[] = [{ kind: "zeros", length: FRONT_PADDING }];
  pieces.push({ kind: "source", source: bytesOf(geometry), offset: 0, length: geometry.length });
  pieces.push({ kind: "source", source: bytesOf(geometry), offset: 0, length: geometry.length });
  for (let slot = 0; slot < metadataSlots; slot += 1) {
    pieces.push({ kind: "source", source: bytesOf(metadata), offset: 0, length: metadata.length });
  }
  for (let slot = 0; slot < metadataSlots; slot += 1) {
    pieces.push({ kind: "source", source: bytesOf(metadata), offset: 0, length: metadata.length });
  }
  let written = FRONT_PADDING + GEOMETRY_SIZE * 2 + metadataSize * metadataSlots * 2;
  if (written < firstLogicalSector * SECTOR_SIZE) {
    pieces.push({ kind: "zeros", length: firstLogicalSector * SECTOR_SIZE - written });
    written = firstLogicalSector * SECTOR_SIZE;
  }
  for (const partition of placed) {
    if (partition.source) {
      pieces.push({ kind: "source", source: partition.source, offset: 0, length: partition.source.size });
      const padding = partition.sizeBytes - partition.source.size;
      if (padding > 0) pieces.push({ kind: "zeros", length: padding });
    } else {
      pieces.push({ kind: "zeros", length: partition.sizeBytes });
    }
    written += partition.sizeBytes;
  }
  if (written < deviceSize) pieces.push({ kind: "zeros", length: deviceSize - written });

  let pieceIndex = 0;
  let pieceOffset = 0;
  const CHUNK = 256 * 1024;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (pieceIndex < pieces.length) {
        const piece = pieces[pieceIndex];
        const length = piece.kind === "zeros" ? piece.length : piece.length;
        const remaining = length - pieceOffset;
        if (remaining <= 0) {
          pieceIndex += 1;
          pieceOffset = 0;
          continue;
        }
        const take = Math.min(remaining, CHUNK);
        if (piece.kind === "zeros") {
          controller.enqueue(new Uint8Array(take));
        } else {
          controller.enqueue(await piece.source.read(piece.offset + pieceOffset, take));
        }
        pieceOffset += take;
        return;
      }
      controller.close();
    },
  });
}

/** A `ByteSource` over bytes already in memory, so the pieces can be handled uniformly. */
function bytesOf(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(offset: number, length: number) {
      return bytes.subarray(offset, offset + length);
    },
  };
}

/** The same image, in memory. */
export async function packSuper(
  partitions: SuperPartitionInput[],
  options: SuperPackOptions = {},
): Promise<Uint8Array> {
  const stream = await packSuperStream(partitions, options);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
