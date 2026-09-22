/**
 * A minimal ext4 image, built from the on-disk layout the kernel documents (`fs/ext4/ext4.h`,
 * `ext4_extents.h`, `namei.c`, Linux v6.6). It exists because the device only offered linear
 * directories and single level extent trees, so the hash tree index and a deeper tree have no
 * real-material coverage.
 *
 * Layout, with 1024 byte blocks: superblock in block 1, group descriptors in block 2, the inode
 * table from block 5, then directory and file data.
 */
export const EXT4_BLOCK_SIZE = 1024;
export const EXT4_FIXTURE_SUPER_OFFSET = 1024;
const GROUP_DESCRIPTOR_BLOCK = 2;
const INODE_TABLE_BLOCK = 5;
const ROOT_DIRECTORY_BLOCK = 8;
const HELLO_DATA_BLOCK = 9;
const NESTED_INDEX_BLOCK = 10;
const NESTED_DATA_BLOCK = 11;
const HELLO_FILE_INO = 3;
const NESTED_FILE_INO = 4;
const INDEXED_DIR_INO = 5;
const INDEX_ROOT_BLOCK = 14;
const INDEX_LEAF_ONE_BLOCK = 15;
const INDEX_LEAF_TWO_BLOCK = 16;
const TOTAL_BLOCKS = 20;

const EXT4_EXTENTS_FL = 0x00080000;
const EXT4_INDEX_FL = 0x00001000;
const EXT4_EXT_MAGIC = 0xf30a;

export interface Ext4Fixture {
  bytes: Uint8Array;
  helloContent: Uint8Array;
  nestedContent: Uint8Array;
  /** Names that the hash indexed directory holds, across two leaf blocks. */
  indexedNames: string[];
}

function writeU16(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 2).setUint16(0, value, true);
}

function writeU32(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 4).setUint32(0, value >>> 0, true);
}

function writeName(out: Uint8Array, at: number, name: string): void {
  out.set(new TextEncoder().encode(name), at);
}

/** `struct ext4_extent_header` (ext4_extents.h:29). */
function writeExtentHeader(out: Uint8Array, at: number, entries: number, depth: number): void {
  writeU16(out, at, EXT4_EXT_MAGIC);
  writeU16(out, at + 2, entries);
  writeU16(out, at + 4, 4);
  writeU16(out, at + 6, depth);
  writeU32(out, at + 8, 0);
}

/** `struct ext4_extent` (ext4_extents.h:36): logical block, length, high and low physical block. */
function writeExtent(out: Uint8Array, at: number, logical: number, length: number, physical: number): void {
  writeU32(out, at, logical);
  writeU16(out, at + 4, length);
  writeU16(out, at + 6, Math.floor(physical / 2 ** 32));
  writeU32(out, at + 8, physical % 2 ** 32);
}

/** `struct ext4_inode` (ext4.h:766): mode, size, flags and the 60 byte `i_block` area. */
function writeInode(
  out: Uint8Array,
  ino: number,
  fields: { mode: number; size: number; flags: number; links?: number },
): number {
  const at = INODE_TABLE_BLOCK * EXT4_BLOCK_SIZE + (ino - 1) * 128;
  writeU16(out, at, fields.mode);
  writeU32(out, at + 4, fields.size);
  writeU16(out, at + 26, fields.links ?? 1);
  writeU32(out, at + 32, fields.flags);
  return at + 40;
}

/** Directory entries: each one's `rec_len` reaches the next, the last reaches the block end. */
function writeDirectoryEntries(out: Uint8Array, at: number, end: number, entries: [string, number, number][]): void {
  let cursor = at;
  entries.forEach(([name, ino, fileType], index) => {
    const needed = 8 + name.length;
    const recLen = index + 1 === entries.length ? end - cursor : Math.ceil(needed / 4) * 4;
    writeU32(out, cursor, ino);
    writeU16(out, cursor + 4, recLen);
    out[cursor + 6] = name.length;
    out[cursor + 7] = fileType;
    writeName(out, cursor + 8, name);
    cursor += recLen;
  });
}

export function buildExt4Fixture(): Ext4Fixture {
  const out = new Uint8Array(TOTAL_BLOCKS * EXT4_BLOCK_SIZE);
  const helloContent = new TextEncoder().encode("hello from the ext4 fixture\n");
  const nestedContent = new Uint8Array(3 * EXT4_BLOCK_SIZE).map((_, index) => (index * 13) % 251);
  const indexedNames = ["alpha.txt", "beta.txt", "gamma.txt"];

  // ---- superblock
  const sb = EXT4_FIXTURE_SUPER_OFFSET;
  writeU32(out, sb + 0x00, 10); // inodes count
  writeU32(out, sb + 0x04, TOTAL_BLOCKS); // blocks count
  writeU32(out, sb + 0x14, 1); // first data block
  writeU32(out, sb + 0x18, 0); // log block size: 1024
  writeU32(out, sb + 0x20, TOTAL_BLOCKS); // blocks per group
  writeU32(out, sb + 0x28, 10); // inodes per group
  writeU16(out, sb + 0x38, 0xef53); // magic
  writeU32(out, sb + 0x4c, 1); // dynamic revision
  writeU32(out, sb + 0x54, 11); // first non-reserved inode
  writeU16(out, sb + 0x58, 128); // inode size
  writeU32(out, sb + 0x5c, 0); // compatible features
  writeU32(out, sb + 0x60, 0x40); // incompatible: EXTENTS only
  writeU32(out, sb + 0x64, 0); // read-only compatible features
  writeName(out, sb + 0x78, "imageforge-ext4");

  // ---- group descriptor: the inode table lives in block 5
  writeU32(out, GROUP_DESCRIPTOR_BLOCK * EXT4_BLOCK_SIZE + 8, INODE_TABLE_BLOCK);

  // ---- inode 2: root directory, one block of entries
  const rootBlock = writeInode(out, 2, { mode: 0x41ed, size: EXT4_BLOCK_SIZE, flags: EXT4_EXTENTS_FL, links: 3 });
  writeExtentHeader(out, rootBlock, 1, 0);
  writeExtent(out, rootBlock + 12, 0, 1, ROOT_DIRECTORY_BLOCK);
  writeDirectoryEntries(out, ROOT_DIRECTORY_BLOCK * EXT4_BLOCK_SIZE, (ROOT_DIRECTORY_BLOCK + 1) * EXT4_BLOCK_SIZE, [
    [".", 2, 2],
    ["..", 2, 2],
    ["hello.txt", HELLO_FILE_INO, 1],
    ["indexed", INDEXED_DIR_INO, 2],
    ["nested.bin", NESTED_FILE_INO, 1],
  ]);

  // ---- inode 3: a small file, one block
  const helloBlock = writeInode(out, HELLO_FILE_INO, {
    mode: 0x81a4,
    size: helloContent.length,
    flags: EXT4_EXTENTS_FL,
  });
  writeExtentHeader(out, helloBlock, 1, 0);
  writeExtent(out, helloBlock + 12, 0, 1, HELLO_DATA_BLOCK);
  out.set(helloContent, HELLO_DATA_BLOCK * EXT4_BLOCK_SIZE);

  // ---- inode 4: a file whose extent tree is one level deep
  const nestedBlock = writeInode(out, NESTED_FILE_INO, {
    mode: 0x81a4,
    size: nestedContent.length,
    flags: EXT4_EXTENTS_FL,
  });
  writeExtentHeader(out, nestedBlock, 1, 1);
  writeU32(out, nestedBlock + 12, 0); // index covers from logical block 0
  writeU32(out, nestedBlock + 16, NESTED_INDEX_BLOCK);
  writeU16(out, nestedBlock + 20, 0);
  const indexAt = NESTED_INDEX_BLOCK * EXT4_BLOCK_SIZE;
  writeExtentHeader(out, indexAt, 2, 0);
  writeExtent(out, indexAt + 12, 0, 1, NESTED_DATA_BLOCK);
  writeExtent(out, indexAt + 24, 1, 2, NESTED_DATA_BLOCK + 1);
  out.set(nestedContent.subarray(0, EXT4_BLOCK_SIZE), NESTED_DATA_BLOCK * EXT4_BLOCK_SIZE);
  out.set(nestedContent.subarray(EXT4_BLOCK_SIZE), (NESTED_DATA_BLOCK + 1) * EXT4_BLOCK_SIZE);

  // ---- inode 5: a hash indexed directory, its index in block 14 and two leaf blocks
  const indexedBlock = writeInode(out, INDEXED_DIR_INO, {
    mode: 0x41ed,
    size: 3 * EXT4_BLOCK_SIZE,
    flags: EXT4_EXTENTS_FL | EXT4_INDEX_FL,
    links: 2,
  });
  writeExtentHeader(out, indexedBlock, 1, 0);
  writeExtent(out, indexedBlock + 12, 0, 3, INDEX_ROOT_BLOCK);

  // the index root: "." and "..", then dx_root_info (8 bytes) and the count/limit pair with entries
  const rootAt = INDEX_ROOT_BLOCK * EXT4_BLOCK_SIZE;
  writeDirectoryEntries(out, rootAt, rootAt + 24, [
    [".", INDEXED_DIR_INO, 2],
    ["..", 2, 2],
  ]);
  writeU32(out, rootAt + 24, 0); // dx_root_info.reserved_zero
  out[rootAt + 28] = 1; // hash version
  out[rootAt + 29] = 8; // info length
  out[rootAt + 30] = 1; // indirect levels
  writeU16(out, rootAt + 32, 60); // limit
  writeU16(out, rootAt + 34, 3); // count, the last entry being the end of the index
  writeU32(out, rootAt + 36, 0); // first hash
  writeU32(out, rootAt + 40, 1); // leaf at logical block 1
  writeU32(out, rootAt + 44, 0x40000000);
  writeU32(out, rootAt + 48, 2); // leaf at logical block 2
  writeU32(out, rootAt + 52, 0x7fffffff); // EXT4_HTREE_EOF
  writeU32(out, rootAt + 56, 3); // the end of the directory

  writeDirectoryEntries(out, INDEX_LEAF_ONE_BLOCK * EXT4_BLOCK_SIZE, (INDEX_LEAF_ONE_BLOCK + 1) * EXT4_BLOCK_SIZE, [
    ["alpha.txt", HELLO_FILE_INO, 1],
    ["beta.txt", HELLO_FILE_INO, 1],
  ]);
  writeDirectoryEntries(out, INDEX_LEAF_TWO_BLOCK * EXT4_BLOCK_SIZE, (INDEX_LEAF_TWO_BLOCK + 1) * EXT4_BLOCK_SIZE, [
    ["gamma.txt", HELLO_FILE_INO, 1],
  ]);

  return { bytes: out, helloContent, nestedContent, indexedNames };
}
