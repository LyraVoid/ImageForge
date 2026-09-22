import { sha256Hex } from "@/core/hash";

/**
 * Builds a `super.img` the way `lpmake` lays one out (liblp metadata_format.h): two geometry copies,
 * then the metadata slot, then the logical partitions as extents of the block device. The checksums
 * are the ones liblp verifies, so a fixture that parses proves the reader checks them properly.
 */
export interface SuperFixtureExtent {
  /** Bytes the extent holds, or `null` for a dm-zero extent. */
  data: Uint8Array | null;
}

export interface SuperFixturePartition {
  name: string;
  group?: string;
  readOnly?: boolean;
  extents: SuperFixtureExtent[];
  /** Written after the extents, so a test can tell where a partition really starts. */
  gapBeforeBytes?: number;
}

const SECTOR = 512;

/** The metadata stores SHA-256 digests as 32 raw bytes, not as hex text. */
async function digestBytes(data: Uint8Array): Promise<Uint8Array> {
  const hex = await sha256Hex(data);
  const out = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function padTo(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

function writeU16(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 2).setUint16(0, value, true);
}

function writeU32(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 4).setUint32(0, value >>> 0, true);
}

function writeU64(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 8).setBigUint64(0, BigInt(value), true);
}

function writeName(out: Uint8Array, at: number, name: string, length = 36): void {
  new TextEncoder().encodeInto(name, out.subarray(at, at + length));
}

export interface SuperFixtureOptions {
  metadataMaxSize?: number;
  slotCount?: number;
  firstLogicalSector?: number;
}

export interface SuperFixtureResult {
  bytes: Uint8Array;
  /** Where each partition's data ended up, in bytes from the start of the image. */
  layouts: { name: string; offsets: number[] }[];
}

export async function buildSuper(
  partitions: SuperFixturePartition[],
  options: SuperFixtureOptions = {},
): Promise<SuperFixtureResult> {
  const metadataMaxSize = options.metadataMaxSize ?? 4096;
  const slotCount = options.slotCount ?? 2;
  const firstLogicalSector = options.firstLogicalSector ?? 64;
  const dataStart = firstLogicalSector * SECTOR;

  const extents: { numSectors: number; targetType: number; targetData: number; targetSource: number }[] = [];
  const layouts: { name: string; offsets: number[] }[] = [];
  let sector = firstLogicalSector;

  for (const partition of partitions) {
    const offsets: number[] = [];
    if (partition.gapBeforeBytes) sector += Math.ceil(partition.gapBeforeBytes / SECTOR);
    for (const extent of partition.extents) {
      const size = extent.data === null ? SECTOR : padTo(extent.data.length, SECTOR);
      offsets.push(sector * SECTOR);
      extents.push({
        numSectors: size / SECTOR,
        targetType: extent.data === null ? 1 : 0,
        targetData: sector,
        targetSource: 0,
      });
      sector += size / SECTOR;
    }
    layouts.push({ name: partition.name, offsets });
  }

  const groupNames = [...new Set(partitions.map((partition) => partition.group ?? "default"))];
  const tablesSize =
    partitions.length * 52 + extents.length * 24 + groupNames.length * 48 + 64;

  const partitionsTable = new Uint8Array(partitions.length * 52);
  let extentIndex = 0;
  partitions.forEach((partition, index) => {
    const at = index * 52;
    writeName(partitionsTable, at, partition.name);
    writeU32(partitionsTable, at + 36, partition.readOnly === false ? 0 : 1);
    writeU32(partitionsTable, at + 40, extentIndex);
    writeU32(partitionsTable, at + 44, partition.extents.length);
    writeU32(partitionsTable, at + 48, groupNames.indexOf(partition.group ?? "default"));
    extentIndex += partition.extents.length;
  });

  const extentsTable = new Uint8Array(extents.length * 24);
  extents.forEach((extent, index) => {
    const at = index * 24;
    writeU64(extentsTable, at, extent.numSectors);
    writeU32(extentsTable, at + 8, extent.targetType);
    writeU64(extentsTable, at + 12, extent.targetData);
    writeU32(extentsTable, at + 20, extent.targetSource);
  });

  const groupsTable = new Uint8Array(groupNames.length * 48);
  groupNames.forEach((name, index) => writeName(groupsTable, index * 48, name));

  const devicesTable = new Uint8Array(64);
  writeU64(devicesTable, 0, firstLogicalSector);
  writeU32(devicesTable, 8, 1048576);
  writeU32(devicesTable, 12, 0);
  writeU64(devicesTable, 16, sector * SECTOR * 2);
  writeName(devicesTable, 24, "super");

  const tables = new Uint8Array(tablesSize);
  tables.set(partitionsTable, 0);
  tables.set(extentsTable, partitionsTable.length);
  tables.set(groupsTable, partitionsTable.length + extentsTable.length);
  tables.set(devicesTable, partitionsTable.length + extentsTable.length + groupsTable.length);

  const tablesOffset = partitionsTable.length + extentsTable.length + groupsTable.length;

  const geometry = new Uint8Array(52);
  writeU32(geometry, 0, 0x616c4467);
  writeU32(geometry, 4, 52);
  writeU32(geometry, 40, metadataMaxSize);
  writeU32(geometry, 44, slotCount);
  writeU32(geometry, 48, 4096);
  geometry.set(await digestBytes(geometry), 8);

  const header = new Uint8Array(256);
  writeU32(header, 0, 0x414c5030);
  writeU16(header, 4, 10);
  writeU16(header, 6, 2);
  writeU32(header, 8, 256);
  writeU32(header, 44, tablesSize);
  header.set(await digestBytes(tables), 48);
  writeU32(header, 80, 0);
  writeU32(header, 84, partitions.length);
  writeU32(header, 88, 52);
  writeU32(header, 92, partitionsTable.length);
  writeU32(header, 96, extents.length);
  writeU32(header, 100, 24);
  writeU32(header, 104, partitionsTable.length + extentsTable.length);
  writeU32(header, 108, groupNames.length);
  writeU32(header, 112, 48);
  writeU32(header, 116, tablesOffset);
  writeU32(header, 120, 1);
  writeU32(header, 124, 64);
  header.set(await digestBytes(header), 12);

  const metadataOffset = 4096 + 4096 * 2;
  const size = Math.max(metadataOffset + 256 + tablesSize, sector * SECTOR);
  const out = new Uint8Array(padTo(size, SECTOR));
  out.set(geometry, 0);
  out.set(geometry, 4096);
  out.set(header, metadataOffset);
  out.set(tables, metadataOffset + 256);

  let written = 0;
  for (const partition of partitions) {
    if (partition.gapBeforeBytes) written += Math.ceil(partition.gapBeforeBytes / SECTOR) * SECTOR;
    for (const extent of partition.extents) {
      if (extent.data) {
        out.set(extent.data, dataStart + written);
        written += padTo(extent.data.length, SECTOR);
      } else {
        written += SECTOR;
      }
    }
  }

  return { bytes: out, layouts };
}
