import { lz4CompressBlock } from "@/wasm/fallback";

/**
 * A minimal but real EROFS image, built by hand from the on-disk layout the kernel documents
 * (`fs/erofs/erofs_fs.h`, Linux v6.6), so the compressed path has test coverage without a device
 * dump: a flat file, and a file stored as LZ4 compressed clusters with the compacted (4 byte) index
 * form and the zero padding feature.
 *
 * What it deliberately does not cover: the 2 byte compacted run, big pclusters and NONHEAD chains.
 * Those are exercised by the real-device tests (see IMAGEFORGE_OTA_PACKAGE), and a fixture that
 * mirrors the reader's own formulas would prove less than those digests do.
 */
export const FIXTURE_BLOCK_SIZE = 4096;
const SUPER_OFFSET = 1024;
const INODE_SLOT = 32;
const ROOT_NID = 36;

// The root directory's content is stored inline, which erofs places right after its inode; the
// files therefore live at nids that leave that space free.
const FLAT_FILE_NID = 40;
const COMPRESSED_FILE_NID = 41;

/** `i_format` (erofs_fs.h:114): version bit 0, datalayout bits 1-3. */
const DATALAYOUT_FLAT = 0;
const DATALAYOUT_FLAT_INLINE = 2;
const DATALAYOUT_COMPRESSED_COMPACT = 3;

const LCLUSTER_SIZE = FIXTURE_BLOCK_SIZE;

export interface ErofsFixture {
  bytes: Uint8Array;
  /** The content of the flat file. */
  flatFile: Uint8Array;
  /** The content of the compressed file, to compare a decode against. */
  compressedFile: Uint8Array;
  paths: { flat: string; compressed: string };
}

function writeU16(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 2).setUint16(0, value, true);
}

function writeU32(out: Uint8Array, at: number, value: number): void {
  new DataView(out.buffer, out.byteOffset + at, 4).setUint32(0, value >>> 0, true);
}

function inodeOffset(nid: number): number {
  return nid * INODE_SLOT;
}

/** A 32 byte compact inode, with the fields the reader looks at. */
function writeCompactInode(
  out: Uint8Array,
  nid: number,
  fields: { mode: number; size: number; datalayout: number; rawBlock?: number; nlink?: number },
): number {
  const at = inodeOffset(nid);
  writeU16(out, at, DATALAYOUT_TO_FORMAT(fields.datalayout));
  writeU16(out, at + 2, 0); // no inline xattrs, so the map header follows the inode directly
  writeU16(out, at + 4, fields.mode);
  writeU16(out, at + 6, fields.nlink ?? 1);
  writeU32(out, at + 8, fields.size);
  writeU32(out, at + 16, fields.rawBlock ?? 0);
  return at;
}

function DATALAYOUT_TO_FORMAT(datalayout: number): number {
  return (datalayout << 1) & 0x0f;
}

/** Directory entries: 12 byte records followed by the names, in name order. */
function buildDirectory(entries: [string, number, number][]): Uint8Array {
  const names = entries.map(([name]) => new TextEncoder().encode(name));
  const nameBytes = names.reduce((sum, name) => sum + name.length, 0);
  const out = new Uint8Array(entries.length * 12 + nameBytes);
  let nameAt = entries.length * 12;
  entries.forEach(([, nid, fileType], index) => {
    writeU32(out, index * 12, nid);
    writeU16(out, index * 12 + 8, nameAt);
    out[index * 12 + 10] = fileType;
    out.set(names[index], nameAt);
    nameAt += names[index].length;
  });
  return out;
}

export function buildErofsFixture(): ErofsFixture {
  const flatFile = new TextEncoder().encode("ImageForge erofs fixture, stored flat.\n");
  // 25 logical clusters (so the index area holds more than one group), and content that LZ4 can
  // actually compress: everything has to fit in the block a pcluster occupies.
  const compressedFile = new Uint8Array(100_000).map((_, index) =>
    index % 977 < 900 ? 0x41 : (index * 7) % 251,
  );

  const lclusterCount = Math.ceil(compressedFile.length / LCLUSTER_SIZE);
  // Blocks: 0 is the superblock and inodes, then the flat file, then one block per pcluster.
  const flatBlock = 1;
  const firstPclusterBlock = 2;
  const totalBlocks = firstPclusterBlock + lclusterCount;
  const out = new Uint8Array(totalBlocks * FIXTURE_BLOCK_SIZE);

  // ---- superblock
  writeU32(out, SUPER_OFFSET + 0, 0xe0f5e1e2);
  out[SUPER_OFFSET + 12] = 12; // blkszbits: 4096
  out[SUPER_OFFSET + 13] = 0; // sb_extslots
  writeU16(out, SUPER_OFFSET + 14, ROOT_NID);
  new DataView(out.buffer, out.byteOffset + SUPER_OFFSET + 16, 8).setBigUint64(0, BigInt(3), true);
  writeU32(out, SUPER_OFFSET + 40, 0); // meta_blkaddr
  out.set(new TextEncoder().encode("imageforge-fixture"), SUPER_OFFSET + 64);
  writeU32(out, SUPER_OFFSET + 80, 0x1); // EROFS_FEATURE_INCOMPAT_ZERO_PADDING

  // ---- root directory, stored inline right after its inode
  const directory = buildDirectory([
    ["big.bin", COMPRESSED_FILE_NID, 1],
    ["hello.txt", FLAT_FILE_NID, 1],
  ]);
  const rootAt = writeCompactInode(out, ROOT_NID, {
    mode: 0x41ed,
    size: directory.length,
    datalayout: DATALAYOUT_FLAT_INLINE,
    nlink: 2,
  });
  out.set(directory, rootAt + INODE_SLOT);

  // ---- a flat file
  writeCompactInode(out, FLAT_FILE_NID, {
    mode: 0x81a4,
    size: flatFile.length,
    datalayout: DATALAYOUT_FLAT,
    rawBlock: flatBlock,
  });
  out.set(flatFile, flatBlock * FIXTURE_BLOCK_SIZE);

  // ---- a compressed file: map header, then the compacted 4 byte indexes, then the pclusters
  const mapHeaderAt = Math.ceil((inodeOffset(COMPRESSED_FILE_NID) + INODE_SLOT) / 8) * 8;
  writeCompactInode(out, COMPRESSED_FILE_NID, {
    mode: 0x81a4,
    size: compressedFile.length,
    datalayout: DATALAYOUT_COMPRESSED_COMPACT,
  });
  const mapHeader = mapHeaderAt;
  writeU16(out, mapHeader + 4, 0); // h_advise: no big pcluster, no 2 byte indexes
  out[mapHeader + 6] = 0; // h_algorithmtype: LZ4 for both heads
  out[mapHeader + 7] = 0; // h_clusterbits: logical clusters are one block

  // The index area starts 8 bytes after the map header. With `amortizedshift` 2 the group is 8
  // bytes: two 16 bit slots and the physical block of the group's first head.
  const indexBase = mapHeader + 8;
  for (let lcn = 0; lcn < lclusterCount; lcn += 1) {
    const position = indexBase + lcn * 4;
    const groupStart = position - (position % 8);
    const slot = (position - groupStart) / 4;
    const groupFirstLcn = (groupStart - indexBase) / 4;
    const value = 0x1000; // type HEAD1, clusterofs 0
    new DataView(out.buffer, out.byteOffset + groupStart + slot * 2, 2).setUint16(0, value, true);
    if (slot === 0) {
      writeU32(out, groupStart + 4, firstPclusterBlock + groupFirstLcn);
    }

    // one pcluster per logical cluster, zero padded in front so the reader has to skip it
    const from = lcn * LCLUSTER_SIZE;
    const to = Math.min(from + LCLUSTER_SIZE, compressedFile.length);
    const compressed = lz4CompressBlock(compressedFile.subarray(from, to));
    if (compressed.length > FIXTURE_BLOCK_SIZE - 1) {
      throw new Error(
        "The fixture's pcluster " + lcn + " compresses to " + compressed.length + " bytes, which does not fit one block.",
      );
    }
    const at = (firstPclusterBlock + lcn) * FIXTURE_BLOCK_SIZE;
    // Zero padding is *leading*: the compressed stream is right aligned in its block, so
    // \`z_erofs_fixup_insize\` skips the zeroes at the front and the stream runs to the block's end.
    out.set(compressed, at + (FIXTURE_BLOCK_SIZE - compressed.length));
  }

  return {
    bytes: out,
    flatFile,
    compressedFile,
    paths: { flat: "/hello.txt", compressed: "/big.bin" },
  };
}
