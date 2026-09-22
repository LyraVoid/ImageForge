import { PackageError } from "../errors";
import { loadWasmModule } from "../../wasm/loader";
import type { ByteSource } from "../package/source";
import { EROFS_FEATURE_INCOMPAT_ZERO_PADDING } from "./erofs";
import type { ErofsInode, ErofsSuperblock } from "./erofs";

/**
 * Compressed erofs file data, ported from the kernel this device runs
 * (`fs/erofs/zmap.c`, `fs/erofs/decompressor.c`, Linux v6.6).
 *
 * A compressed inode carries a map header right after its inode and xattr body
 * (`zmap.c:603`: `ALIGN(iloc + inode_isize + xattr_isize, 8)`), then one lcluster index per logical
 * cluster. Indexes are either the full 8 byte form or the packed "compacted" one, where the first
 * indexes are 4 bytes until the area is 32 byte aligned and the aligned run is 2 bytes each
 * (`decode_compactedbits`, `zmap.c:83`). A logical cluster is PLAIN (stored raw), the HEAD of an LZ4
 * pcluster, or a NONHEAD that points back to its head.
 *
 * What this build refuses, by name: files in the packed inode (fragments), interlaced pclusters, and
 * inline pclusters — each of those is a feature of its own and guessing them would hand out wrong
 * bytes.
 */
export const Z_EROFS_ADVISE_COMPACTED_2B = 0x0001;
export const Z_EROFS_ADVISE_BIG_PCLUSTER_1 = 0x0002;
export const Z_EROFS_ADVISE_BIG_PCLUSTER_2 = 0x0004;
export const Z_EROFS_ADVISE_INLINE_PCLUSTER = 0x0008;
export const Z_EROFS_ADVISE_INTERLACED_PCLUSTER = 0x0010;
export const Z_EROFS_ADVISE_FRAGMENT_PCLUSTER = 0x0020;

export const Z_EROFS_FRAGMENT_INODE_BIT = 7;
export const Z_EROFS_LCLUSTER_TYPE_PLAIN = 0;
export const Z_EROFS_LCLUSTER_TYPE_HEAD1 = 1;
export const Z_EROFS_LCLUSTER_TYPE_NONHEAD = 2;
export const Z_EROFS_LCLUSTER_TYPE_HEAD2 = 3;
export const Z_EROFS_LI_D0_CBLKCNT = 1 << 11;

/** `Z_EROFS_COMPRESSION_*`: the algorithms a head lcluster may name. */
export const Z_EROFS_COMPRESSION_LZ4 = 0;
export const Z_EROFS_COMPRESSION_LZMA = 1;
export const Z_EROFS_COMPRESSION_DEFLATE = 2;

const ALGORITHM_NAME: Record<number, string> = {
  [Z_EROFS_COMPRESSION_LZ4]: "LZ4",
  [Z_EROFS_COMPRESSION_LZMA]: "LZMA",
  [Z_EROFS_COMPRESSION_DEFLATE]: "DEFLATE",
};

export interface ErofsZConfig {
  advise: number;
  /** Algorithm of head 1 and head 2 lclusters. */
  algorithmType: [number, number];
  /** `blkszbits + h_clusterbits & 7`: the logical cluster size. */
  logicalClusterBits: number;
  logicalClusterSize: number;
  idataSize: number;
  /** Set when the file lives in the packed inode. */
  packedInPackedInode: boolean;
  mapHeaderOffset: number;
}

export interface ErofsExtent {
  /** Logical offset this extent starts at. */
  logicalOffset: number;
  /** Bytes of the file this extent covers. */
  length: number;
  /** Physical offset of the (compressed or raw) pcluster. */
  physicalOffset: number;
  /** Bytes the pcluster occupies on disk. */
  compressedLength: number;
  kind: "plain" | "lz4";
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function align(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

/** `zmap.c:603`: the map header lives at the first 8 byte boundary after the inode and its xattrs. */
export function mapHeaderOffset(inode: ErofsInode): number {
  return align(inode.offset + (inode.version === "compact" ? 32 : 64) + inode.xattrSize, 8);
}

export async function readErofsZConfig(
  source: ByteSource,
  superblock: ErofsSuperblock,
  inode: ErofsInode,
): Promise<ErofsZConfig> {
  const offset = mapHeaderOffset(inode);
  const header = await source.read(offset, 8);
  if (header.length < 8) {
    throw new PackageError(
      "The compression map header of inode " + inode.nid + " is past the end of the image.",
      "This erofs image is truncated.",
    );
  }
  const raw = new DataView(header.buffer, header.byteOffset, 8).getBigUint64(0, true);
  const clusterbits = header[7];
  if ((clusterbits >> Z_EROFS_FRAGMENT_INODE_BIT) & 1) {
    throw new PackageError(
      "Inode " + inode.nid + " is stored in the packed inode (fragment offset " + (raw ^ (1n << 63n)) + ").",
      "This file lives in the erofs packed inode, which this build does not read yet.",
    );
  }
  const advise = readU16(header, 4);
  const algorithmtype = header[6];
  const logicalClusterBits = superblock.blkBits + (clusterbits & 7);
  return {
    advise,
    algorithmType: [algorithmtype & 15, algorithmtype >> 4],
    logicalClusterBits,
    logicalClusterSize: 1 << logicalClusterBits,
    idataSize: readU16(header, 2),
    packedInPackedInode: false,
    mapHeaderOffset: offset,
  };
}

function checkSupported(config: ErofsZConfig, inode: ErofsInode): void {
  if (config.advise & Z_EROFS_ADVISE_FRAGMENT_PCLUSTER) {
    throw new PackageError(
      "Inode " + inode.nid + " uses an erofs fragment pcluster (advise 0x" + config.advise.toString(16) + ").",
      "This file uses erofs fragments, which this build does not read yet.",
    );
  }
  if (config.advise & Z_EROFS_ADVISE_INTERLACED_PCLUSTER) {
    throw new PackageError(
      "Inode " + inode.nid + " uses interlaced pclusters (advise 0x" + config.advise.toString(16) + ").",
      "This file uses interlaced erofs pclusters, which this build does not read yet.",
    );
  }
  if (config.advise & Z_EROFS_ADVISE_INLINE_PCLUSTER) {
    throw new PackageError(
      "Inode " + inode.nid + " uses an inline pcluster (advise 0x" + config.advise.toString(16) + ").",
      "This file keeps its last pcluster inline, which this build does not read yet.",
    );
  }
  for (const algorithm of config.algorithmType) {
    if (algorithm !== Z_EROFS_COMPRESSION_LZ4) {
      throw new PackageError(
        "Inode " + inode.nid + " is compressed with " + (ALGORITHM_NAME[algorithm] ?? algorithm) + ".",
        "This file is compressed with " +
          (ALGORITHM_NAME[algorithm] ?? "an algorithm") +
          ", and this build only expands LZ4 compressed erofs data.",
      );
    }
  }
}

/** `zmap.c:83`: the packed index bits, 4 bytes at a time. */
function decodeCompactedBits(
  bytes: Uint8Array,
  at: number,
  bitPosition: number,
  logicalClusterBits: number,
): { value: number; type: number } {
  const word = readU32(bytes, at + Math.floor(bitPosition / 8)) >>> (bitPosition & 7);
  const lomask = (1 << logicalClusterBits) - 1;
  return { value: word & lomask, type: (word >> logicalClusterBits) & 3 };
}

interface RawIndex {
  type: number;
  clusterofs: number;
  delta0: number;
  delta1: number;
  physicalBlock: number;
  compressedBlocks: number;
}

/**
 * One lcluster index, from either index form. The packed form is read out of a 32 byte group: the
 * group holds `vcnt` indexes of `encodebits` bits plus the 4 byte physical block number at its end
 * (`unpack_compacted_index`, `zmap.c:118`).
 */
class IndexReader {
  private readonly source: ByteSource;
  private readonly config: ErofsZConfig;
  private readonly inode: ErofsInode;
  private readonly totalClusters: number;

  constructor(source: ByteSource, config: ErofsZConfig, inode: ErofsInode, totalClusters: number) {
    this.source = source;
    this.config = config;
    this.inode = inode;
    this.totalClusters = totalClusters;
  }

  private get compacted(): boolean {
    return this.inode.dataLayout === "compressed-compact";
  }

  /** `z_erofs_load_full_lcluster` (`zmap.c:26`) and `z_erofs_load_compact_lcluster` (`zmap.c:229`). */
  async load(lcn: number, lookahead: boolean): Promise<RawIndex> {
    const index: RawIndex = {
      type: Z_EROFS_LCLUSTER_TYPE_PLAIN,
      clusterofs: 0,
      delta0: 0,
      delta1: 0,
      physicalBlock: 0,
      compressedBlocks: 0,
    };
    if (!this.compacted) {
      const at = this.config.mapHeaderOffset + 16 + lcn * 8;
      const bytes = await this.source.read(at, 8);
      const advise = readU16(bytes, 0);
      const type = (advise >> 0) & 3;
      index.type = type;
      index.clusterofs = readU16(bytes, 2);
      if (type === Z_EROFS_LCLUSTER_TYPE_NONHEAD) {
        index.delta0 = readU16(bytes, 4);
        index.delta1 = readU16(bytes, 6);
      } else {
        index.physicalBlock = readU32(bytes, 4);
      }
      return index;
    }

    // The packed layout: 4 byte indexes until the area is 32 byte aligned, then a 2 byte run, then
    // 4 byte indexes again (`zmap.c:243`).
    const ebase = this.config.mapHeaderOffset + 8;
    let compacted4bInitial = (32 - (ebase % 32)) / 4;
    if (compacted4bInitial === 8) compacted4bInitial = 0;
    let compacted2b = 0;
    if (this.config.advise & Z_EROFS_ADVISE_COMPACTED_2B && compacted4bInitial < this.totalClusters) {
      compacted2b = Math.floor((this.totalClusters - compacted4bInitial) / 16) * 16;
    }
    let position = ebase;
    let index2 = lcn;
    let amortizedShift = 2;
    if (index2 >= compacted4bInitial) {
      position += compacted4bInitial * 4;
      index2 -= compacted4bInitial;
      if (index2 < compacted2b) {
        amortizedShift = 1;
      } else {
        position += compacted2b * 2;
        index2 -= compacted2b;
        amortizedShift = 2;
      }
    }
    position += index2 * (1 << amortizedShift);

    // vcnt indexes share a group; the group's last 4 bytes are the physical block number.
    const vcnt = 1 << amortizedShift === 4 ? 2 : 16;
    const groupSize = vcnt << amortizedShift;
    const groupStart = position - (position % groupSize);
    const group = await this.source.read(groupStart, groupSize);
    const encodebits = ((vcnt << amortizedShift) - 4) * 8 / vcnt;
    const eofs = position - groupStart;
    const slot = Math.floor(eofs / (1 << amortizedShift));
    const logicalClusterBits = this.config.logicalClusterBits;
    const decode = (at: number) => decodeCompactedBits(group, 0, at, logicalClusterBits);

    let { value: lo } = decode(encodebits * slot);
    const { type } = decode(encodebits * slot);
    index.type = type;
    const bigPcluster = (this.config.advise & Z_EROFS_ADVISE_BIG_PCLUSTER_1) !== 0;

    if (type === Z_EROFS_LCLUSTER_TYPE_NONHEAD) {
      index.clusterofs = 1 << logicalClusterBits;
      if (lookahead) {
        // `get_compacted_la_distance` (`zmap.c:95`): walk forward to the next head.
        let distance = 0;
        let at = slot;
        for (;;) {
          const entry = decode(encodebits * at);
          if (entry.type !== Z_EROFS_LCLUSTER_TYPE_NONHEAD) break;
          distance += 1;
          at += 1;
          if (at >= vcnt) {
            if (!(entry.value & Z_EROFS_LI_D0_CBLKCNT)) distance += entry.value - 1;
            break;
          }
          lo = entry.value;
        }
        index.delta1 = distance;
      }
      if (lo & Z_EROFS_LI_D0_CBLKCNT) {
        index.compressedBlocks = lo & ~Z_EROFS_LI_D0_CBLKCNT;
        index.delta0 = 1;
        return index;
      }
      if (slot + 1 !== vcnt) {
        index.delta0 = lo;
        return index;
      }
      // The last lcluster of a group stores delta[1] instead of delta[0].
      const previous = decode(encodebits * (slot - 1));
      index.delta0 = previous.type !== Z_EROFS_LCLUSTER_TYPE_NONHEAD ? 1 : (previous.value & Z_EROFS_LI_D0_CBLKCNT ? 2 : previous.value + 1);
      return index;
    }

    index.clusterofs = lo;
    index.delta0 = 0;
    // The head's physical block: count the heads before it (`unpack_compacted_index`).
    let nblk = 0;
    let at = slot;
    while (at > 0) {
      at -= 1;
      const entry = decode(encodebits * at);
      if (entry.type === Z_EROFS_LCLUSTER_TYPE_NONHEAD) {
        if (bigPcluster) {
          if (entry.value & Z_EROFS_LI_D0_CBLKCNT) {
            at -= 1;
            nblk += entry.value & ~Z_EROFS_LI_D0_CBLKCNT;
            continue;
          }
          if (entry.value <= 1) {
            throw new PackageError(
              "A big pcluster index of inode " + this.inode.nid + " has delta " + entry.value + ".",
              "This erofs image is damaged.",
            );
          }
          at -= entry.value - 2;
          continue;
        }
        at -= entry.value;
      }
      nblk += 1;
    }
    index.physicalBlock = readU32(group, groupSize - 4) + nblk;
    return index;
  }
}

/** Reads a whole compressed file, one pcluster at a time. */
export async function readCompressedFile(
  source: ByteSource,
  superblock: ErofsSuperblock,
  inode: ErofsInode,
): Promise<Uint8Array> {
  const config = await readErofsZConfig(source, superblock, inode);
  checkSupported(config, inode);
  const lclusterSize = config.logicalClusterSize;
  const totalClusters = Math.ceil(inode.size / lclusterSize);
  const reader = new IndexReader(source, config, inode, totalClusters);
  const output = new Uint8Array(inode.size);
  const blockSize = 1 << superblock.blkBits;
  const zeroPadded = (superblock.featureIncompat & EROFS_FEATURE_INCOMPAT_ZERO_PADDING) !== 0;

  let lcn = 0;
  while (lcn < totalClusters) {
    const entry = await reader.load(lcn, false);
    let head = entry;
    let headLcn = lcn;
    if (entry.type === Z_EROFS_LCLUSTER_TYPE_NONHEAD) {
      // Look back to the head of this pcluster (`z_erofs_extent_lookback`, `zmap.c:293`).
      let distance = entry.delta0;
      let at = lcn;
      for (;;) {
        if (at < distance) {
          throw new PackageError(
            "A lcluster of inode " + inode.nid + " points back past the start of the file.",
            "This erofs image is damaged.",
          );
        }
        at -= distance;
        const candidate = await reader.load(at, false);
        if (candidate.type === Z_EROFS_LCLUSTER_TYPE_NONHEAD) {
          distance = candidate.delta0;
          if (distance === 0) {
            throw new PackageError(
              "A lcluster of inode " + inode.nid + " has a zero lookback distance.",
              "This erofs image is damaged.",
            );
          }
          continue;
        }
        head = candidate;
        headLcn = at;
        break;
      }
    }

    const logicalStart = headLcn * lclusterSize + head.clusterofs;
    // How much of the file this pcluster covers: up to the next head lcluster
    // (`z_erofs_get_extent_decompressedlen`, `zmap.c:410`).
    let covered: number;
    {
      const at = headLcn;
      let step = 1;
      const clusterofs = head.clusterofs;
      for (;;) {
        if ((at + step) * lclusterSize + clusterofs >= inode.size || at + step >= totalClusters) {
          covered = inode.size - logicalStart;
          break;
        }
        const next = await reader.load(at + step, true);
        if (next.type === Z_EROFS_LCLUSTER_TYPE_NONHEAD) {
          step += next.delta1;
          if (next.delta1 === 0) {
            covered = (at + step) * lclusterSize + clusterofs - logicalStart;
            break;
          }
          continue;
        }
        if (at + step === headLcn) {
          step += 1;
          continue;
        }
        covered = (at + step) * lclusterSize + next.clusterofs - logicalStart;
        break;
      }
    }

    const physicalOffset = head.physicalBlock * blockSize;
    const headType = head.type;
    if (headType === Z_EROFS_LCLUSTER_TYPE_PLAIN) {
      // Raw data: one lcluster, copied from the pcluster's start to its logical position
      // (`z_erofs_transform_plain`, `decompressor.c:320`, "shifted").
      const length = Math.min(lclusterSize, covered);
      const data = await source.read(physicalOffset, length);
      output.set(data.subarray(0, Math.min(data.length, length)), logicalStart);
      lcn = headLcn + Math.ceil(length / lclusterSize);
      continue;
    }

    // A compressed pcluster: its compressed length is the CBLKCNT of the first NONHEAD, or one
    // lcluster when the head is followed by another head (`z_erofs_get_extent_compressedlen`).
    let compressedBlocks = head.compressedBlocks;
    if (compressedBlocks === 0) {
      if (headLcn + 1 < totalClusters) {
        const next = await reader.load(headLcn + 1, false);
        if (next.type === Z_EROFS_LCLUSTER_TYPE_NONHEAD) {
          if (next.delta0 !== 1) {
            throw new PackageError(
              "A pcluster of inode " + inode.nid + " has no compressed block count.",
              "This erofs image is damaged.",
            );
          }
          compressedBlocks = next.compressedBlocks;
        }
      }
      // A head followed by another head is a one lcluster pcluster.
      if (compressedBlocks === 0) compressedBlocks = lclusterSize / blockSize;
    }
    const compressedLength = compressedBlocks * blockSize;

    const expected = Math.min(covered, inode.size - logicalStart);
    let blob = await source.read(physicalOffset, compressedLength);
    if (zeroPadded) {
      // `z_erofs_fixup_insize` (decompressor.c:190): with zero padding the pcluster may start with
      // padding zeros, and the LZ4 stream begins at its first non-zero byte.
      const firstNonZero = blob.findIndex((byte) => byte !== 0);
      if (firstNonZero < 0) {
        throw new PackageError(
          "The pcluster of inode " + inode.nid + " at " + physicalOffset + " is all zeroes.",
          "This erofs image is damaged.",
        );
      }
      blob = blob.subarray(firstNonZero);
    }
    const wasm = await loadWasmModule();
    const expanded = wasm.lz4DecompressBlock(blob, expected);
    output.set(expanded.subarray(0, Math.min(expanded.length, expected)), logicalStart);
    lcn = headLcn + Math.max(1, Math.ceil(covered / lclusterSize));
  }

  return output;
}
