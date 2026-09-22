import { PackageError } from "../errors";
import { sha256Hex } from "../hash";
import type { ByteSource } from "../package/source";

/**
 * `super.img`: the dynamic partition metadata of AOSP's `liblp`
 * (system/core @ android-16.0.0_r1, `fs_mgr/liblp/include/liblp/metadata_format.h`).
 *
 * The partition starts with two copies of a geometry struct, then one metadata slot per A/B slot,
 * then the same again as a backup (`utility.cpp:84`: `LP_PARTITION_RESERVED_BYTES + 2 *
 * LP_METADATA_GEOMETRY_SIZE + metadata_max_size * slot`), and logical partitions live in the space
 * after the metadata. Every extent names a sector of the containing block device, so a logical
 * partition can be read out of the image in ranges instead of being copied first.
 */
export const LP_METADATA_GEOMETRY_MAGIC = 0x616c4467;
export const LP_METADATA_HEADER_MAGIC = 0x414c5030;
export const LP_SECTOR_SIZE = 512;
export const LP_PARTITION_RESERVED_BYTES = 4096;
export const LP_METADATA_GEOMETRY_SIZE = 4096;
export const LP_METADATA_MAJOR_VERSION = 10;
export const LP_METADATA_HEADER_SIZE = 256;
export const LP_METADATA_GEOMETRY_STRUCT_SIZE = 52;

export const LP_TARGET_TYPE_LINEAR = 0;
export const LP_TARGET_TYPE_ZERO = 1;

export const LP_PARTITION_ATTR_READONLY = 1 << 0;
export const LP_PARTITION_ATTR_SLOT_SUFFIXED = 1 << 1;
export const LP_PARTITION_ATTR_UPDATED = 1 << 2;
export const LP_PARTITION_ATTR_DISABLED = 1 << 3;

export interface LpGeometry {
  metadataMaxSize: number;
  metadataSlotCount: number;
  logicalBlockSize: number;
}

export interface LpExtent {
  numSectors: number;
  targetType: number;
  /** For LINEAR extents: the sector of the containing block device this maps onto. */
  targetData: number;
  /** For LINEAR extents: which block device in the table. */
  targetSource: number;
}

export interface LpPartition {
  name: string;
  attributes: number;
  group: string;
  sizeBytes: number;
  extents: LpExtent[];
  readOnly: boolean;
  disabled: boolean;
}

export interface LpBlockDevice {
  name: string;
  firstLogicalSector: number;
  alignment: number;
  alignmentOffset: number;
  sizeBytes: number;
}

export interface ParsedSuper {
  slot: number;
  geometry: LpGeometry;
  headerVersion: string;
  blockDevices: LpBlockDevice[];
  groups: string[];
  partitions: LpPartition[];
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readU64(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  const value = view.getBigUint64(0, true);
  return Number(value);
}

function readName(bytes: Uint8Array, offset: number, length = 36): string {
  const raw = bytes.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return new TextDecoder().decode(end < 0 ? raw : raw.subarray(0, end));
}

/** The primary metadata of a slot, per `utility.cpp:84`. */
export function primaryMetadataOffset(geometry: LpGeometry, slot: number): number {
  return LP_PARTITION_RESERVED_BYTES + LP_METADATA_GEOMETRY_SIZE * 2 + geometry.metadataMaxSize * slot;
}

export async function parseSuper(source: ByteSource, slot = 0): Promise<ParsedSuper> {
  if (source.size < LP_METADATA_GEOMETRY_SIZE * 2) {
    throw new PackageError(
      "A super image needs at least " + LP_METADATA_GEOMETRY_SIZE * 2 + " bytes; this file is " + source.size + ".",
      "This file is too short to hold logical partition metadata.",
    );
  }
  const geometryBytes = await source.read(0, LP_METADATA_GEOMETRY_STRUCT_SIZE);
  if (readU32(geometryBytes, 0) !== LP_METADATA_GEOMETRY_MAGIC) {
    throw new PackageError(
      "The geometry magic is 0x" + readU32(geometryBytes, 0).toString(16) + ", not 0x616c4467.",
      "This is not a super image with logical partition metadata.",
    );
  }
  const structSize = readU32(geometryBytes, 4);
  if (structSize !== LP_METADATA_GEOMETRY_STRUCT_SIZE) {
    throw new PackageError(
      "The geometry struct is " + structSize + " bytes, expected " + LP_METADATA_GEOMETRY_STRUCT_SIZE + ".",
      "This super image uses a metadata revision this build does not know.",
    );
  }
  const declaredGeometryChecksum = geometryBytes.slice(8, 40);
  const zeroed = new Uint8Array(geometryBytes);
  zeroed.fill(0, 8, 40);
  if ((await sha256Hex(zeroed)) !== hexOf(declaredGeometryChecksum)) {
    throw new PackageError(
      "The geometry checksum does not match (" + hexOf(declaredGeometryChecksum).slice(0, 16) + ").",
      "This super image is damaged: its geometry checksum does not match.",
    );
  }

  const geometry: LpGeometry = {
    metadataMaxSize: readU32(geometryBytes, 40),
    metadataSlotCount: readU32(geometryBytes, 44),
    logicalBlockSize: readU32(geometryBytes, 48),
  };
  if (geometry.metadataSlotCount === 0 || geometry.metadataMaxSize % LP_SECTOR_SIZE !== 0) {
    throw new PackageError(
      "The geometry declares " +
        geometry.metadataSlotCount +
        " slots and " +
        geometry.metadataMaxSize +
        " bytes of metadata per slot.",
      "This super image is damaged.",
    );
  }
  if (slot >= geometry.metadataSlotCount) {
    throw new PackageError(
      "Slot " + slot + " is beyond the " + geometry.metadataSlotCount + " slots this image declares.",
      "This super image has no such slot.",
    );
  }

  const metadataOffset = primaryMetadataOffset(geometry, slot);
  const headerBytes = await source.read(metadataOffset, LP_METADATA_HEADER_SIZE);
  if (headerBytes.length < LP_METADATA_HEADER_SIZE) {
    throw new PackageError("The metadata header runs past the end of the file.", "This super image is truncated.");
  }
  if (readU32(headerBytes, 0) !== LP_METADATA_HEADER_MAGIC) {
    throw new PackageError(
      "The metadata magic is 0x" + readU32(headerBytes, 0).toString(16) + ", not 0x414c5030.",
      "This super image has no readable metadata.",
    );
  }
  const majorVersion = readU16(headerBytes, 4);
  const minorVersion = readU16(headerBytes, 6);
  if (majorVersion !== LP_METADATA_MAJOR_VERSION) {
    throw new PackageError(
      "Metadata major version " + majorVersion + " is not the supported " + LP_METADATA_MAJOR_VERSION + ".",
      "This super image uses a metadata revision this build does not know.",
    );
  }
  const headerSize = readU32(headerBytes, 8);
  if (headerSize !== LP_METADATA_HEADER_SIZE) {
    throw new PackageError(
      "The metadata header is " + headerSize + " bytes, expected " + LP_METADATA_HEADER_SIZE + ".",
      "This super image uses a metadata revision this build does not know.",
    );
  }
  const declaredHeaderChecksum = headerBytes.slice(12, 44);
  const zeroedHeader = new Uint8Array(headerBytes);
  zeroedHeader.fill(0, 12, 44);
  if ((await sha256Hex(zeroedHeader)) !== hexOf(declaredHeaderChecksum)) {
    throw new PackageError(
      "The metadata header checksum does not match (" + hexOf(declaredHeaderChecksum).slice(0, 16) + ").",
      "This super image is damaged: its metadata header checksum does not match.",
    );
  }

  const tablesSize = readU32(headerBytes, 44);
  if (tablesSize > geometry.metadataMaxSize) {
    throw new PackageError(
      "The tables claim " + tablesSize + " bytes, more than the " + geometry.metadataMaxSize + " reserved.",
      "This super image is damaged.",
    );
  }
  const tablesBytes = await source.read(metadataOffset + headerSize, tablesSize);
  if (tablesBytes.length !== tablesSize) {
    throw new PackageError("The metadata tables run past the end of the file.", "This super image is truncated.");
  }
  if ((await sha256Hex(tablesBytes)) !== hexOf(headerBytes.slice(48, 80))) {
    throw new PackageError(
      "The metadata tables checksum does not match (" + hexOf(headerBytes.slice(48, 80)).slice(0, 16) + ").",
      "This super image is damaged: its metadata tables checksum does not match.",
    );
  }

  const table = (at: number) => ({
    offset: readU32(headerBytes, at),
    numEntries: readU32(headerBytes, at + 4),
    entrySize: readU32(headerBytes, at + 8),
  });
  const partitionsTable = table(80);
  const extentsTable = table(92);
  const groupsTable = table(104);
  const devicesTable = table(116);

  const sliceTable = (descriptor: { offset: number; numEntries: number; entrySize: number }, expected: number, label: string) => {
    if (descriptor.entrySize !== expected) {
      throw new PackageError(
        "The " + label + " table has " + descriptor.entrySize + " byte entries, expected " + expected + ".",
        "This super image uses a metadata revision this build does not know.",
      );
    }
    const end = descriptor.offset + descriptor.numEntries * descriptor.entrySize;
    if (end > tablesBytes.length) {
      throw new PackageError(
        "The " + label + " table runs past the end of the metadata tables.",
        "This super image is damaged.",
      );
    }
    return tablesBytes.subarray(descriptor.offset, end);
  };

  const devices = sliceTable(devicesTable, 64, "block device");
  const blockDevices: LpBlockDevice[] = [];
  for (let index = 0; index < devicesTable.numEntries; index += 1) {
    const at = index * 64;
    blockDevices.push({
      firstLogicalSector: readU64(devices, at),
      alignment: readU32(devices, at + 8),
      alignmentOffset: readU32(devices, at + 12),
      sizeBytes: readU64(devices, at + 16),
      name: readName(devices, at + 24),
    });
  }

  const groups = sliceTable(groupsTable, 48, "group");
  const groupNames: string[] = [];
  for (let index = 0; index < groupsTable.numEntries; index += 1) {
    groupNames.push(readName(groups, index * 48));
  }

  const extents = sliceTable(extentsTable, 24, "extent");
  const allExtents: LpExtent[] = [];
  for (let index = 0; index < extentsTable.numEntries; index += 1) {
    const at = index * 24;
    allExtents.push({
      numSectors: readU64(extents, at),
      targetType: readU32(extents, at + 8),
      targetData: readU64(extents, at + 12),
      targetSource: readU32(extents, at + 20),
    });
  }

  const partitionsBytes = sliceTable(partitionsTable, 52, "partition");
  const partitions: LpPartition[] = [];
  for (let index = 0; index < partitionsTable.numEntries; index += 1) {
    const at = index * 52;
    const attributes = readU32(partitionsBytes, at + 36);
    const firstExtentIndex = readU32(partitionsBytes, at + 40);
    const numExtents = readU32(partitionsBytes, at + 44);
    const groupIndex = readU32(partitionsBytes, at + 48);
    const owned = allExtents.slice(firstExtentIndex, firstExtentIndex + numExtents);
    partitions.push({
      name: readName(partitionsBytes, at),
      attributes,
      group: groupNames[groupIndex] ?? "default",
      sizeBytes: owned.reduce((sum, extent) => sum + extent.numSectors * LP_SECTOR_SIZE, 0),
      extents: owned,
      readOnly: (attributes & LP_PARTITION_ATTR_READONLY) !== 0,
      disabled: (attributes & LP_PARTITION_ATTR_DISABLED) !== 0,
    });
  }

  return {
    slot,
    geometry,
    headerVersion: majorVersion + "." + minorVersion,
    blockDevices,
    groups: groupNames,
    partitions,
  };
}

/**
 * A logical partition as a source of its own: the extents are mapped lazily, so reading a partition
 * out of a multi gigabyte super image reads only the sectors that partition occupies.
 */
export function logicalPartitionSource(
  source: ByteSource,
  parsed: ParsedSuper,
  partitionName: string,
): ByteSource {
  const partition = parsed.partitions.find((entry) => entry.name === partitionName);
  if (!partition) {
    throw new PackageError(
      "The metadata has no partition named " +
        partitionName +
        "; it has " +
        parsed.partitions.map((entry) => entry.name).join(", ") +
        ".",
      "This super image has no partition called " + partitionName + ".",
    );
  }
  // Cumulative logical offsets: extent i covers [starts[i], starts[i] + size).
  const starts: number[] = [];
  let total = 0;
  for (const extent of partition.extents) {
    starts.push(total);
    total += extent.numSectors * LP_SECTOR_SIZE;
  }

  return {
    size: total,
    read: async (offset, length) => {
      const start = Math.max(0, Math.min(offset, total));
      const end = Math.max(start, Math.min(start + length, total));
      if (end === start) return new Uint8Array(0);
      const out = new Uint8Array(end - start);

      for (let index = 0; index < partition.extents.length; index += 1) {
        const extent = partition.extents[index];
        const extentStart = starts[index];
        const extentSize = extent.numSectors * LP_SECTOR_SIZE;
        if (extentStart >= end || extentStart + extentSize <= start) continue;
        const from = Math.max(start, extentStart) - extentStart;
        const to = Math.min(end, extentStart + extentSize) - extentStart;
        if (extent.targetType === LP_TARGET_TYPE_ZERO) continue; // stays zero
        if (extent.targetType !== LP_TARGET_TYPE_LINEAR) {
          throw new PackageError(
            "Extent " + index + " of " + partitionName + " is target type " + extent.targetType + ".",
            "This logical partition is not a plain linear mapping, so this build cannot read it.",
          );
        }
        if (extent.targetSource !== 0) {
          throw new PackageError(
            "Extent " +
              index +
              " of " +
              partitionName +
              " lives on block device " +
              extent.targetSource +
              " of " +
              parsed.blockDevices.length +
              ".",
            "This logical partition spans more than one block device, which this build does not map.",
          );
        }
        const physical = extent.targetData * LP_SECTOR_SIZE + from;
        const data = await source.read(physical, to - from);
        if (data.length !== to - from) {
          throw new PackageError(
            "Extent " + index + " of " + partitionName + " reads past the end of the image.",
            "This super image is truncated.",
          );
        }
        out.set(data, extentStart - start + from);
      }
      return out;
    },
  };
}

function hexOf(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
