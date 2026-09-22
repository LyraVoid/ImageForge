import { PackageError } from "../errors";
import type { ByteSource } from "../package/source";

/**
 * EROFS, the read-only filesystem Android 13+ ships system images in, from the kernel this device
 * runs (`fs/erofs/erofs_fs.h`, Linux v6.6).
 *
 * Reading it needs three things: the superblock at offset 1024, an inode (32 byte compact or 64 byte
 * extended form) at `meta_blkaddr << blkszbits + nid << 5` (`internal.h:307`, `super.c:390`), and
 * directory entries of 12 bytes followed by their names. File *data* is only read for inodes that are
 * stored flat: erofs compresses with LZ4 per cluster, and this build does not unpack that yet, so a
 * compressed inode is refused by its datalayout instead of being handed out wrong.
 */
export const EROFS_SUPER_MAGIC = 0xe0f5e1e2;
export const EROFS_SUPER_OFFSET = 1024;
export const EROFS_SUPER_SIZE = 128;
/** `super.c:390`: islotbits is ilog2(sizeof(erofs_inode_compact)) = 5. */
export const EROFS_ISLOT_BITS = 5;

export const EROFS_FEATURE_INCOMPAT_ZERO_PADDING = 0x00000001;
export const EROFS_FEATURE_INCOMPAT_COMPR_CFGS = 0x00000002;
export const EROFS_FEATURE_INCOMPAT_BIG_PCLUSTER = 0x00000002;
export const EROFS_FEATURE_INCOMPAT_CHUNKED_FILE = 0x00000004;
export const EROFS_FEATURE_INCOMPAT_DEVICE_TABLE = 0x00000008;
export const EROFS_FEATURE_INCOMPAT_ZTAILPACKING = 0x00000010;
export const EROFS_FEATURE_INCOMPAT_FRAGMENTS = 0x00000020;
export const EROFS_FEATURE_INCOMPAT_XATTR_PREFIXES = 0x00000040;

/** `i_format` fields (erofs_fs.h:114). */
export const EROFS_I_VERSION_MASK = 0x01;
export const EROFS_I_DATALAYOUT_MASK = 0x07;
export const EROFS_I_DATALAYOUT_BIT = 1;

export type ErofsDataLayout = "flat" | "compressed" | "flat-inline" | "compressed-compact" | "chunk-based";

const DATA_LAYOUT: Record<number, ErofsDataLayout> = {
  0: "flat",
  1: "compressed",
  2: "flat-inline",
  3: "compressed-compact",
  4: "chunk-based",
};

/** `erofs_dirent.file_type` follows the generic `FT_*` numbering. */
export const EROFS_FILE_TYPE: Record<number, string> = {
  0: "unknown",
  1: "file",
  2: "directory",
  3: "character",
  4: "block",
  5: "fifo",
  6: "socket",
  7: "symlink",
};

export interface ErofsSuperblock {
  blockSize: number;
  blkBits: number;
  dirBlockSize: number;
  rootNid: number;
  inos: number;
  metaBlkAddr: number;
  featureIncompat: number;
  volumeName: string;
  /** The features this build understands; anything outside it is reported, not ignored. */
  unknownFeatures: number;
}

export interface ErofsInode {
  nid: number;
  offset: number;
  version: "compact" | "extended";
  format: number;
  dataLayout: ErofsDataLayout;
  mode: number;
  size: number;
  nlink: number;
  uid: number;
  gid: number;
  /** First block of a flat inode's data. */
  rawBlock: number;
  /** Bytes stored inline right after the inode and its xattr body (datalayout 2), if any. */
  inlineBytes: number;
  /** Where that inline data starts: iloc + inode_isize + xattr_isize (inode.c:123-125, 222). */
  inlineOffset: number;
  /** The inode's inline xattr body size, which the compression map header sits after. */
  xattrSize: number;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface ErofsDirectoryEntry {
  name: string;
  nid: number;
  fileType: string;
  inode?: number;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readU64(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return Number(view.getBigUint64(0, true));
}

export async function parseErofs(source: ByteSource): Promise<ErofsSuperblock> {
  if (source.size < EROFS_SUPER_OFFSET + EROFS_SUPER_SIZE) {
    throw new PackageError(
      "An erofs superblock sits at " +
        EROFS_SUPER_OFFSET +
        " and the file is " +
        source.size +
        " bytes.",
      "This file is too short to be an erofs image.",
    );
  }
  const bytes = await source.read(EROFS_SUPER_OFFSET, EROFS_SUPER_SIZE);
  if (readU32(bytes, 0) !== EROFS_SUPER_MAGIC) {
    throw new PackageError(
      "The magic is 0x" + readU32(bytes, 0).toString(16) + ", not 0xe0f5e1e2.",
      "This is not an erofs image.",
    );
  }
  const blkBits = bytes[12];
  if (blkBits < 9 || blkBits > 16) {
    throw new PackageError(
      "The superblock declares a block size shift of " + blkBits + ".",
      "This erofs image is damaged.",
    );
  }
  const featureIncompat = readU32(bytes, 80);
  const known =
    EROFS_FEATURE_INCOMPAT_ZERO_PADDING |
    EROFS_FEATURE_INCOMPAT_COMPR_CFGS |
    EROFS_FEATURE_INCOMPAT_CHUNKED_FILE |
    EROFS_FEATURE_INCOMPAT_ZTAILPACKING |
    EROFS_FEATURE_INCOMPAT_FRAGMENTS |
    EROFS_FEATURE_INCOMPAT_XATTR_PREFIXES |
    EROFS_FEATURE_INCOMPAT_DEVICE_TABLE;

  return {
    blockSize: 1 << blkBits,
    blkBits,
    dirBlockSize: 1 << (bytes[90] || blkBits),
    rootNid: readU16(bytes, 14),
    inos: readU64(bytes, 16),
    metaBlkAddr: readU32(bytes, 40),
    featureIncompat,
    volumeName: new TextDecoder().decode(bytes.subarray(64, 80)).split("\u0000")[0],
    unknownFeatures: featureIncompat & ~known,
  };
}

/** Where an inode lives: `erofs_iloc` (internal.h:307). */
export function inodeOffset(superblock: ErofsSuperblock, nid: number): number {
  return (superblock.metaBlkAddr << superblock.blkBits) + (nid << EROFS_ISLOT_BITS);
}

export async function readInode(
  source: ByteSource,
  superblock: ErofsSuperblock,
  nid: number,
): Promise<ErofsInode> {
  const offset = inodeOffset(superblock, nid);
  const head = await source.read(offset, 4);
  if (head.length < 4) {
    throw new PackageError(
      "Inode " + nid + " at " + offset + " is past the end of the image.",
      "This erofs image is truncated.",
    );
  }
  const format = readU16(head, 0);
  const version = (format & EROFS_I_VERSION_MASK) === 0 ? "compact" : "extended";
  const size = version === "compact" ? 32 : 64;
  const bytes = await source.read(offset, size);
  if (bytes.length < size) {
    throw new PackageError(
      "Inode " + nid + " needs " + size + " bytes but only " + bytes.length + " were read.",
      "This erofs image is truncated.",
    );
  }
  const dataLayout = DATA_LAYOUT[(format >> EROFS_I_DATALAYOUT_BIT) & EROFS_I_DATALAYOUT_MASK] ?? "flat";
  const mode = readU16(bytes, 4);
  const inodeSize = version === "compact" ? readU32(bytes, 8) : readU64(bytes, 8);
  const rawBlock = readU32(bytes, 16);

  // erofs_xattr_ibody_size: a 12 byte header plus 4 bytes per additional xattr slot.
  const xattrIcount = readU16(bytes, 2);
  const xattrSize = xattrIcount === 0 ? 0 : 12 + 4 * (xattrIcount - 1);
  const inlineBytes = dataLayout === "flat-inline" ? inodeSize % superblock.blockSize : 0;

  return {
    nid,
    offset,
    version,
    format,
    dataLayout,
    mode,
    size: inodeSize,
    nlink: version === "compact" ? readU16(bytes, 6) : readU32(bytes, 44),
    uid: version === "compact" ? readU16(bytes, 24) : readU32(bytes, 24),
    gid: version === "compact" ? readU16(bytes, 26) : readU32(bytes, 28),
    rawBlock,
    inlineBytes,
    inlineOffset: offset + size + xattrSize,
    xattrSize,
    isDirectory: (mode & 0xf000) === 0x4000,
    isSymlink: (mode & 0xf000) === 0xa000,
  };
}

/** The bytes of a directory or a flat file. Compressed and chunk based data is refused by name. */
export async function readInodeData(
  source: ByteSource,
  superblock: ErofsSuperblock,
  inode: ErofsInode,
): Promise<Uint8Array> {
  if (inode.dataLayout === "compressed" || inode.dataLayout === "compressed-compact") {
    // Imported on demand: the compacted index decoder and the LZ4 path are only needed for files
    // that are actually compressed, and the import keeps the two modules from depending on each
    // other at module scope.
    const { readCompressedFile } = await import("./erofs-z");
    return readCompressedFile(source, superblock, inode);
  }
  if (inode.dataLayout === "chunk-based") {
    throw new PackageError(
      "Inode " + inode.nid + " is chunk based (EROFS_FEATURE_INCOMPAT_CHUNKED_FILE).",
      "This file is stored in chunks across devices, which this build cannot read yet.",
    );
  }
  const out = new Uint8Array(inode.size);
  // A flat inode keeps whole blocks on disk, including a partial last block; a flat-inline inode
  // keeps that partial block inline instead, right after the inode and its xattr body.
  const fullBlocks =
    inode.dataLayout === "flat-inline"
      ? Math.floor(inode.size / superblock.blockSize)
      : Math.ceil(inode.size / superblock.blockSize);
  if (fullBlocks > 0) {
    const want = Math.min(inode.size, fullBlocks * superblock.blockSize);
    const bytes = await source.read(inode.rawBlock << superblock.blkBits, want);
    if (bytes.length < want) {
      throw new PackageError(
        "Inode " + inode.nid + " reads past the end of the image.",
        "This erofs image is truncated.",
      );
    }
    out.set(bytes, 0);
  }
  if (inode.inlineBytes > 0) {
    const inline = await source.read(inode.inlineOffset, inode.inlineBytes);
    if (inline.length < inode.inlineBytes) {
      throw new PackageError(
        "The inline tail of inode " + inode.nid + " is past the end of the image.",
        "This erofs image is truncated.",
      );
    }
    out.set(inline, inode.size - inode.inlineBytes);
  }
  return out;
}

/**
 * The entries of a directory. Each directory block holds a run of 12 byte dirents followed by the
 * names they point at, so the array ends where the first name begins and each name ends where the
 * next one starts (the last one runs to the end of the block).
 */
export async function readDirectory(
  source: ByteSource,
  superblock: ErofsSuperblock,
  inode: ErofsInode,
): Promise<ErofsDirectoryEntry[]> {
  const data = await readInodeData(source, superblock, inode);
  const entries: ErofsDirectoryEntry[] = [];

  for (let blockStart = 0; blockStart < data.length; blockStart += superblock.dirBlockSize) {
    const block = data.subarray(blockStart, Math.min(blockStart + superblock.dirBlockSize, data.length));
    if (block.length < 12) continue;
    const first = readU16(block, 8);
    const count = Math.floor(first / 12);
    for (let index = 0; index < count; index += 1) {
      const at = index * 12;
      const nameStart = readU16(block, at + 8);
      const nameEnd = index + 1 < count ? readU16(block, at + 20) : block.length;
      if (nameStart < 12 * count || nameEnd < nameStart || nameEnd > block.length) {
        throw new PackageError(
          "A directory entry of inode " + inode.nid + " is out of range (" + nameStart + ".." + nameEnd + ").",
          "This erofs image is damaged.",
        );
      }
      const name = new TextDecoder().decode(block.subarray(nameStart, nameEnd));
      if (name === "." || name === "..") continue;
      const fileType = block[at + 10];
      entries.push({
        name,
        nid: readU64(block, at),
        fileType: EROFS_FILE_TYPE[fileType] ?? "unknown(0x" + fileType.toString(16) + ")",
      });
    }
  }
  return entries;
}

/**
 * Follows a path from the root, one inode at a time. Symlinks are followed (Android images use them
 * heavily: `/system/etc` is one), with a hop limit so a loop cannot hang a browse.
 */
export async function resolveErofsPath(
  source: ByteSource,
  superblock: ErofsSuperblock,
  path: string,
  maxHops = 8,
): Promise<ErofsInode> {
  let parts = path.split("/").filter((part) => part !== "");
  let inode = await readInode(source, superblock, superblock.rootNid);
  let hops = 0;
  let index = 0;

  while (index < parts.length) {
    if (!inode.isDirectory) {
      if (!inode.isSymlink || hops >= maxHops) {
        throw new PackageError(
          "Inode " + inode.nid + " is not a directory, so it cannot hold " + parts[index] + ".",
          "That path does not exist in this image.",
        );
      }
      const target = new TextDecoder().decode(await readInodeData(source, superblock, inode));
      hops += 1;
      const prefix = target.startsWith("/") ? [] : parts.slice(0, index);
      parts = [...prefix, ...target.split("/").filter((part) => part !== ""), ...parts.slice(index + 1)];
      index = 0;
      inode = await readInode(source, superblock, superblock.rootNid);
      continue;
    }
    const entries = await readDirectory(source, superblock, inode);
    const entry = entries.find((candidate) => candidate.name === parts[index]);
    if (!entry) {
      throw new PackageError(
        "Directory inode " + inode.nid + " has no entry named " + parts[index] + ".",
        "That path does not exist in this image.",
      );
    }
    inode = await readInode(source, superblock, entry.nid);
    index += 1;
  }
  return inode;
}
