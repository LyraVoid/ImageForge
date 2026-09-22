import { PackageError } from "../errors";
import type { ByteSource } from "../package/source";

/**
 * ext4, read only, from the kernel this device runs: `fs/ext4/ext4.h` (superblock, inode, group
 * descriptor, directory entry, feature flags), `fs/ext4/ext4_extents.h` (extent tree) and
 * `fs/ext4/namei.c` (hash tree index), Linux v6.6.
 *
 * What it reads: the superblock and its feature set, inodes, the extent tree of a file (depth 0 and
 * deeper), linear directories, and hash indexed directories through their index. What it refuses by
 * name: inodes without extents (the old indirect block map), meta block groups, inline data
 * directories and encrypted directories.
 */
export const EXT4_SUPER_MAGIC = 0xef53;
export const EXT4_SUPER_OFFSET = 1024;
export const EXT4_ROOT_INO = 2;

export const EXT4_FEATURE_INCOMPAT_META_BG = 0x0010;
export const EXT4_FEATURE_INCOMPAT_EXTENTS = 0x0040;
export const EXT4_FEATURE_INCOMPAT_64BIT = 0x0080;
export const EXT4_FEATURE_INCOMPAT_INLINE_DATA = 0x8000;
export const EXT4_FEATURE_INCOMPAT_ENCRYPT = 0x10000;

export const EXT4_EXTENTS_FL = 0x00080000;
export const EXT4_INDEX_FL = 0x00001000;
export const EXT4_EXT_MAGIC = 0xf30a;

/** `EXT4_FT_*` (ext4.h:2354). */
export const EXT4_FILE_TYPE: Record<number, string> = {
  0: "unknown",
  1: "file",
  2: "directory",
  3: "character",
  4: "block",
  5: "fifo",
  6: "socket",
  7: "symlink",
};

export interface Ext4Superblock {
  blockSize: number;
  inodesCount: number;
  blocksCount: number;
  blocksPerGroup: number;
  inodesPerGroup: number;
  inodeSize: number;
  descSize: number;
  firstIno: number;
  featureCompat: number;
  featureIncompat: number;
  featureRoCompat: number;
  volumeName: string;
  is64Bit: boolean;
}

export interface Ext4Extent {
  /** First logical block this extent covers. */
  logicalBlock: number;
  /** Number of blocks it covers (0 means 32768, the `ee_len` convention). */
  length: number;
  /** First physical block. */
  physicalBlock: number;
  /** True for an uninitialised extent, whose content is zeroes and must not be read from disk. */
  uninitialised?: boolean;
}

export interface Ext4Inode {
  number: number;
  mode: number;
  size: number;
  links: number;
  flags: number;
  /** The 60 bytes of `i_block`: an extent tree root for files that use extents. */
  block: Uint8Array;
  hasExtents: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface Ext4DirectoryEntry {
  name: string;
  ino: number;
  fileType: string;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export async function parseExt4(source: ByteSource): Promise<Ext4Superblock> {
  if (source.size < EXT4_SUPER_OFFSET + 1024) {
    throw new PackageError(
      "An ext4 superblock sits at " + EXT4_SUPER_OFFSET + " and the file is " + source.size + " bytes.",
      "This file is too short to be an ext4 filesystem.",
    );
  }
  const bytes = await source.read(EXT4_SUPER_OFFSET, 1024);
  if (readU16(bytes, 0x38) !== EXT4_SUPER_MAGIC) {
    throw new PackageError(
      "The magic is 0x" + readU16(bytes, 0x38).toString(16) + ", not 0xef53.",
      "This is not an ext4 filesystem.",
    );
  }
  const logBlockSize = readU32(bytes, 0x18);
  if (logBlockSize > 6) {
    throw new PackageError("The block size shift is " + logBlockSize + ".", "This ext4 image is damaged.");
  }
  const featureIncompat = readU32(bytes, 0x60);
  const is64Bit = (featureIncompat & EXT4_FEATURE_INCOMPAT_64BIT) !== 0;
  const declaredDescSize = readU16(bytes, 0xfe);
  const descSize = is64Bit && declaredDescSize > 32 ? declaredDescSize : 32;
  const volumeName = new TextDecoder().decode(bytes.subarray(0x78, 0x88)).split("\u0000")[0];

  return {
    blockSize: 1024 << logBlockSize,
    inodesCount: readU32(bytes, 0x00),
    blocksCount: readU32(bytes, 0x04) + (is64Bit ? readU32(bytes, 0x150) * 2 ** 32 : 0),
    blocksPerGroup: readU32(bytes, 0x20),
    inodesPerGroup: readU32(bytes, 0x28),
    inodeSize: readU16(bytes, 0x58),
    descSize,
    firstIno: readU32(bytes, 0x54),
    featureCompat: readU32(bytes, 0x5c),
    featureIncompat,
    featureRoCompat: readU32(bytes, 0x64),
    volumeName,
    is64Bit,
  };
}

export function checkExt4Supported(superblock: Ext4Superblock): void {
  if (superblock.featureIncompat & EXT4_FEATURE_INCOMPAT_META_BG) {
    throw new PackageError(
      "The filesystem has EXT4_FEATURE_INCOMPAT_META_BG set.",
      "This ext4 filesystem uses meta block groups, which this build does not read.",
    );
  }
  if (superblock.featureIncompat & EXT4_FEATURE_INCOMPAT_INLINE_DATA) {
    throw new PackageError(
      "The filesystem has EXT4_FEATURE_INCOMPAT_INLINE_DATA set.",
      "This ext4 filesystem keeps small files and directories inline, which this build does not read.",
    );
  }
  if (superblock.featureIncompat & EXT4_FEATURE_INCOMPAT_ENCRYPT) {
    throw new PackageError(
      "The filesystem has EXT4_FEATURE_INCOMPAT_ENCRYPT set.",
      "This ext4 filesystem has encrypted directories, which this build does not read.",
    );
  }
}

/** The group descriptor table starts after the superblock (ext4.h's layout: block 2 with 1K blocks). */
function groupDescriptorOffset(superblock: Ext4Superblock): number {
  return superblock.blockSize === 1024 ? superblock.blockSize * 2 : superblock.blockSize;
}

async function readGroupInodeTable(
  source: ByteSource,
  superblock: Ext4Superblock,
  group: number,
): Promise<number> {
  const at = groupDescriptorOffset(superblock) + group * superblock.descSize;
  const descriptor = await source.read(at, Math.min(superblock.descSize, 64));
  if (descriptor.length < 32) {
    throw new PackageError(
      "Group descriptor " + group + " is past the end of the image.",
      "This ext4 image is truncated.",
    );
  }
  const low = readU32(descriptor, 8);
  const high = superblock.descSize > 32 && descriptor.length >= 44 ? readU32(descriptor, 40) : 0;
  return high * 2 ** 32 + low;
}

export async function readExt4Inode(
  source: ByteSource,
  superblock: Ext4Superblock,
  ino: number,
): Promise<Ext4Inode> {
  if (ino < 1 || ino > superblock.inodesCount) {
    throw new PackageError(
      "Inode " + ino + " is outside the " + superblock.inodesCount + " inodes of this filesystem.",
      "This ext4 image is damaged.",
    );
  }
  const group = Math.floor((ino - 1) / superblock.inodesPerGroup);
  const index = (ino - 1) % superblock.inodesPerGroup;
  const table = await readGroupInodeTable(source, superblock, group);
  const at = table * superblock.blockSize + index * superblock.inodeSize;
  const bytes = await source.read(at, Math.max(128, superblock.inodeSize));
  if (bytes.length < 128) {
    throw new PackageError("Inode " + ino + " is past the end of the image.", "This ext4 image is truncated.");
  }
  const mode = readU16(bytes, 0);
  const sizeLow = readU32(bytes, 4);
  const sizeHigh = readU32(bytes, 108);
  const flags = readU32(bytes, 32);
  const isRegular = (mode & 0xf000) === 0x8000;
  return {
    number: ino,
    mode,
    size: isRegular ? sizeHigh * 2 ** 32 + sizeLow : sizeLow,
    links: readU16(bytes, 26),
    flags,
    block: bytes.slice(40, 100),
    hasExtents: (flags & EXT4_EXTENTS_FL) !== 0,
    isDirectory: (mode & 0xf000) === 0x4000,
    isSymlink: (mode & 0xf000) === 0xa000,
  };
}

function requireExtents(inode: Ext4Inode): void {
  if (!inode.hasExtents) {
    throw new PackageError(
      "Inode " + inode.number + " has no EXT4_EXTENTS_FL.",
      "This inode uses the old indirect block map, which this build does not read.",
    );
  }
}

/** Walks the extent tree of an inode and returns its extents, in logical order. */
export async function readExt4Extents(
  source: ByteSource,
  superblock: Ext4Superblock,
  inode: Ext4Inode,
): Promise<Ext4Extent[]> {
  requireExtents(inode);
  const extents: Ext4Extent[] = [];

  const walk = async (node: Uint8Array, depth: number): Promise<void> => {
    if (readU16(node, 0) !== EXT4_EXT_MAGIC) {
      throw new PackageError(
        "An extent node of inode " + inode.number + " has magic 0x" + readU16(node, 0).toString(16) + ".",
        "This ext4 image is damaged.",
      );
    }
    const entries = readU16(node, 2);
    const nodeDepth = readU16(node, 6);
    if (depth !== nodeDepth) {
      throw new PackageError(
        "An extent node of inode " + inode.number + " declares depth " + nodeDepth + " but is at " + depth + ".",
        "This ext4 image is damaged.",
      );
    }
    for (let index = 0; index < entries; index += 1) {
      const at = 12 + index * 12;
      if (nodeDepth === 0) {
        const rawLength = readU16(node, at + 4);
        // ee_len > 32768 means an uninitialised (sparse) extent of ee_len - 32768 blocks, whose
        // content is defined to be zeroes (ext4_extents.h:52).
        const uninitialised = rawLength > 32768;
        extents.push({
          logicalBlock: readU32(node, at),
          length: uninitialised ? rawLength - 32768 : rawLength,
          physicalBlock: readU16(node, at + 6) * 2 ** 32 + readU32(node, at + 8),
          uninitialised,
        });
      } else {
        const leaf = readU16(node, at + 8) * 2 ** 32 + readU32(node, at + 4);
        const block = await source.read(leaf * superblock.blockSize, superblock.blockSize);
        if (block.length < 12) {
          throw new PackageError(
            "Extent node at block " + leaf + " is past the end of the image.",
            "This ext4 image is truncated.",
          );
        }
        await walk(block, nodeDepth - 1);
      }
    }
  };

  await walk(inode.block, readU16(inode.block, 6));
  return extents.sort((left, right) => left.logicalBlock - right.logicalBlock);
}

/** Reads a file's bytes through its extent tree, holes coming back as zeroes. */
export async function readExt4File(
  source: ByteSource,
  superblock: Ext4Superblock,
  inode: Ext4Inode,
  limit = 256 * 1024 * 1024,
): Promise<Uint8Array> {
  if (inode.size > limit) {
    throw new PackageError(
      "Inode " + inode.number + " is " + inode.size + " bytes, above the " + limit + " byte limit.",
      "This file is too large to read into memory.",
    );
  }
  const extents = await readExt4Extents(source, superblock, inode);
  const output = new Uint8Array(inode.size);
  const blockSize = superblock.blockSize;
  const totalBlocks = Math.ceil(inode.size / blockSize);

  for (const extent of extents) {
    if (extent.uninitialised) continue;
    const first = extent.logicalBlock;
    const last = extent.logicalBlock + extent.length;
    for (let block = first; block < Math.min(last, totalBlocks); block += 1) {
      const target = (block - first + extent.physicalBlock) * blockSize;
      const at = block * blockSize;
      const length = Math.min(blockSize, inode.size - at);
      const data = await source.read(target, length);
      output.set(data.subarray(0, Math.min(data.length, length)), at);
    }
  }
  return output;
}

/**
 * The entries of a directory. A linear directory is a chain of entries that step by `rec_len`. A
 * hash indexed directory (`EXT4_INDEX_FL`) keeps its index in the first block — a count/limit pair
 * followed by hash/block pairs (`dx_countlimit`, `dx_entry`, namei.c:228) — and the entry blocks it
 * points at; both kinds of leaf are read the same way.
 */
export async function listExt4Directory(
  source: ByteSource,
  superblock: Ext4Superblock,
  inode: Ext4Inode,
): Promise<Ext4DirectoryEntry[]> {
  if (!inode.isDirectory) {
    throw new PackageError(
      "Inode " + inode.number + " is not a directory.",
      "That path is not a directory in this filesystem.",
    );
  }
  const extents = await readExt4Extents(source, superblock, inode);
  const blockSize = superblock.blockSize;
  const totalBlocks = Math.max(1, Math.floor(inode.size / blockSize));
  const entries: Ext4DirectoryEntry[] = [];

  const scan = async (block: number, fromOffset: number, until = blockSize): Promise<void> => {
    const data = await source.read(block * blockSize, blockSize);
    let at = fromOffset;
    const end = Math.min(until, data.length);
    while (at + 8 <= end) {
      const entryIno = readU32(data, at);
      const recordLength = readU16(data, at + 4);
      const nameLength = data[at + 6];
      if (recordLength < 8 || at + recordLength > end) break;
      if (entryIno !== 0 && nameLength > 0 && nameLength <= 255 && at + 8 + nameLength <= data.length) {
        const name = new TextDecoder().decode(data.subarray(at + 8, at + 8 + nameLength));
        if (name !== "." && name !== "..") {
          entries.push({ name, ino: entryIno, fileType: EXT4_FILE_TYPE[data[at + 7]] ?? "unknown" });
        }
      }
      at += recordLength;
    }
  };

  const indexed = (inode.flags & EXT4_INDEX_FL) !== 0;
  const blockOfLogical = (logical: number): number | null => {
    for (const extent of extents) {
      if (logical >= extent.logicalBlock && logical < extent.logicalBlock + extent.length) {
        return extent.physicalBlock + (logical - extent.logicalBlock);
      }
    }
    return null;
  };

  if (!indexed) {
    for (let logical = 0; logical < totalBlocks; logical += 1) {
      const block = blockOfLogical(logical);
      if (block !== null) await scan(block, 0);
    }
    return entries;
  }

  // Hash indexed: block 0 carries the root (dirents, then the index), and every block the index
  // points at is a leaf whose dirents are read from the start.
  const root = blockOfLogical(0);
  if (root === null) {
    throw new PackageError(
      "The first block of directory inode " + inode.number + " is a hole.",
      "This ext4 image is damaged.",
    );
  }
  const rootData = await source.read(root * blockSize, blockSize);
  if (rootData.length < 40) {
    throw new PackageError("The index root of inode " + inode.number + " is truncated.", "This ext4 image is damaged.");
  }
  // The root block holds the entries that belong to its own leaf first, then the index:
  // ".", ".." (24 bytes), the dx_root_info (8 bytes) and a count/limit pair followed by hash/block
  // pairs. Only the dirents before the index are read here; the rest of the entries live in leaves.
  const indexAt = 8 + 4 + 8 + 4 + 8;
  await scan(root, 0, indexAt);
  const count = readU16(rootData, indexAt + 2);
  for (let index = 0; index < count; index += 1) {
    const at = indexAt + 4 + index * 8;
    if (at + 8 > rootData.length) break;
    // dx_entry.block is a *logical* block of the directory, and the last entry is the EOF sentinel.
    const block = readU32(rootData, at + 4);
    if (block === 0 || block >= totalBlocks) continue;
    const physical = blockOfLogical(block);
    if (physical !== null) await scan(physical, 0);
  }
  return entries;
}

export async function resolveExt4Path(
  source: ByteSource,
  superblock: Ext4Superblock,
  path: string,
): Promise<Ext4Inode> {
  const parts = path.split("/").filter((part) => part !== "");
  let inode = await readExt4Inode(source, superblock, EXT4_ROOT_INO);
  for (const part of parts) {
    if (!inode.isDirectory) {
      throw new PackageError(
        "Inode " + inode.number + " is not a directory, so it cannot hold " + part + ".",
        "That path does not exist in this filesystem.",
      );
    }
    const entries = await listExt4Directory(source, superblock, inode);
    const entry = entries.find((candidate) => candidate.name === part);
    if (!entry) {
      throw new PackageError(
        "Directory inode " + inode.number + " has no entry named " + part + ".",
        "That path does not exist in this filesystem.",
      );
    }
    inode = await readExt4Inode(source, superblock, entry.ino);
  }
  return inode;
}
