import { detectCompression, formatFromBootHeader } from "../image";
import { LP_METADATA_GEOMETRY_MAGIC, LP_PARTITION_RESERVED_BYTES } from "../partition/lp";
import { BOOT_MAGIC, VENDOR_BOOT_MAGIC } from "../image/bootimage/constants";
import { decodeBootHeader, decodeVendorBootHeader } from "../image/bootimage/header";
import type { ArtifactKind } from "./kinds";

/** How the bytes are framed. */
export type ContainerFormat =
  | "raw"
  | "zip"
  | "ota-payload"
  | "sparse"
  | "gzip"
  | "lz4-legacy"
  | "lz4-frame"
  | "xz"
  | "lzma"
  | "bzip2"
  | "zstd"
  | "cpio"
  | "unknown";

/** What the bytes are, once the framing is understood. */
export type ContentFormat =
  | "boot"
  | "init_boot"
  | "vendor_boot"
  | "ext4"
  | "erofs"
  | "f2fs"
  | "dtb"
  | "elf"
  | "super"
  | "unknown";

export interface DetectedArtifact {
  container: ContainerFormat;
  content: ContentFormat;
  /** What a tool matches on. */
  kind: ArtifactKind;
  /** Engine prose: the interface translates it through the record table. */
  label: string;
  /** True when the real content is still packed inside the container. */
  packed: boolean;
  /** The boot header version, when this is an Android boot image. */
  headerVersion?: number;
}

export const CONTAINER_LABEL: Record<ContainerFormat, string> = {
  raw: "Raw bytes",
  zip: "Zip archive",
  "ota-payload": "Android OTA payload",
  sparse: "Android sparse image",
  gzip: "GZip stream",
  "lz4-legacy": "LZ4 legacy stream",
  "lz4-frame": "LZ4 frame",
  xz: "XZ stream",
  lzma: "LZMA stream",
  bzip2: "BZip2 stream",
  zstd: "Zstandard stream",
  cpio: "CPIO archive",
  unknown: "Unknown container",
};

export const CONTENT_LABEL: Record<ContentFormat, string> = {
  boot: "Android boot image",
  init_boot: "Android init_boot image",
  vendor_boot: "Android vendor boot image",
  ext4: "ext4 filesystem",
  erofs: "EROFS filesystem",
  f2fs: "F2FS filesystem",
  dtb: "Device tree blob",
  elf: "ELF object",
  super: "Logical partition image (super)",
  unknown: "Unknown content",
};

/** The first bytes of an Android OTA payload (update_engine, "CrAU"). */
const OTA_PAYLOAD_MAGIC = [0x43, 0x72, 0x41, 0x55];
/** Android's sparse image header (libsparse: SPARSE_HEADER_MAGIC). */
const SPARSE_MAGIC = [0x3a, 0xff, 0x26, 0xed];
/** Filesystem superblocks live at these offsets inside a partition image. */
const SUPERBLOCK_OFFSET = 1024;
const EXT4_MAGIC_OFFSET = 0x438;
const EXT4_MAGIC = [0x53, 0xef];
/** EROFS_SUPER_MAGIC_V1, little endian. */
const EROFS_MAGIC = [0xe2, 0xe1, 0xf5, 0xe0];
/** F2FS_SUPER_MAGIC, little endian. */
const F2FS_MAGIC = [0x10, 0x20, 0xf5, 0xf2];
/** Device tree blob magic, big endian. */
const DTB_MAGIC = [0xd0, 0x0d, 0xfe, 0xed];
const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46];

function matches(bytes: Uint8Array, offset: number, magic: number[]): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[offset + index] !== magic[index]) return false;
  }
  return true;
}

function textMatches(bytes: Uint8Array, offset: number, magic: string): boolean {
  return matches(bytes, offset, [...magic].map((character) => character.charCodeAt(0)));
}

/**
 * Classifies bytes by their magic. Only formats that can be told apart from a prefix are detected
 * here, and every entry names where its magic comes from:
 *
 * * {@link BOOT_MAGIC} and {@link VENDOR_BOOT_MAGIC} are this project's own constants;
 * * the zip, sparse and OTA payload magics are the container headers of Android itself;
 * * the filesystem magics are the ones the kernels define for ext4, EROFS and F2FS.
 *
 * Vendor boot logo containers are deliberately absent: their magics differ per vendor and none of
 * them is verified here yet, so a logo image is reported as an unknown blob instead of a guess.
 */
export function detectArtifact(bytes: Uint8Array): DetectedArtifact {
  const compression = detectCompression(bytes);

  if (textMatches(bytes, 0, BOOT_MAGIC) || textMatches(bytes, 0, VENDOR_BOOT_MAGIC)) {
    // Only the header is decoded, never the whole file, so this works on a prefix of an 8 GiB image
    // as well as on a buffer. A header that cannot be read still counts as a boot image of its
    // magic's kind; the tool that handles it reports why it stopped.
    const vendor = textMatches(bytes, 0, VENDOR_BOOT_MAGIC);
    let content: ContentFormat = vendor ? "vendor_boot" : "boot";
    let headerVersion: number | undefined;
    try {
      if (vendor) {
        headerVersion = decodeVendorBootHeader(bytes).headerVersion;
      } else {
        const header = decodeBootHeader(bytes);
        content = formatFromBootHeader(header);
        headerVersion = header.headerVersion;
      }
    } catch {
      // keep the verdict the magic gave
    }
    return {
      container: "raw",
      content,
      kind: "boot-container",
      label: CONTENT_LABEL[content],
      packed: false,
      ...(headerVersion === undefined ? {} : { headerVersion }),
    };
  }

  if (matches(bytes, 0, SPARSE_MAGIC)) {
    return { container: "sparse", content: "unknown", kind: "partition-image", label: CONTAINER_LABEL.sparse, packed: true };
  }
  if (matches(bytes, 0, OTA_PAYLOAD_MAGIC)) {
    return {
      container: "ota-payload",
      content: "unknown",
      kind: "package",
      label: CONTAINER_LABEL["ota-payload"],
      packed: true,
    };
  }
  if (matches(bytes, 0, [0x50, 0x4b, 0x03, 0x04]) || matches(bytes, 0, [0x50, 0x4b, 0x05, 0x06])) {
    return { container: "zip", content: "unknown", kind: "package", label: CONTAINER_LABEL.zip, packed: true };
  }

  if (compression === "cpio") {
    return { container: "cpio", content: "unknown", kind: "ramdisk", label: CONTENT_LABEL.unknown, packed: false };
  }
  if (compression !== "none" && compression !== "unknown") {
    return {
      container: compression,
      content: "unknown",
      kind: "blob",
      label: CONTAINER_LABEL[compression],
      packed: true,
    };
  }

  if (matches(bytes, EXT4_MAGIC_OFFSET, EXT4_MAGIC)) {
    return { container: "raw", content: "ext4", kind: "filesystem", label: CONTENT_LABEL.ext4, packed: false };
  }
  // A super image keeps its geometry at LP_PARTITION_RESERVED_BYTES, which is where AOSP's reader
  // looks and where lpmake writes it. Naming it properly is what offers the unpack tool for it:
  // without this it was a plain blob and the interface did not suggest anything.
  const readsGeometryAt = (offset: number): boolean => {
    if (bytes.length < offset + 4) return false;
    let magic = 0;
    for (let index = 0; index < 4; index += 1) magic |= bytes[offset + index] << (index * 8);
    return magic >>> 0 === LP_METADATA_GEOMETRY_MAGIC;
  };
  // A full image keeps the geometry at LP_PARTITION_RESERVED_BYTES; the compact super_empty form
  // that lpmake writes without images keeps it at offset 0 and the metadata at 4096 instead.
  if (readsGeometryAt(LP_PARTITION_RESERVED_BYTES) || readsGeometryAt(0)) {
    {
      return {
        container: "raw",
        content: "super",
        kind: "partition-image",
        label: CONTENT_LABEL.super,
        packed: false,
      };
    }
  }
  if (matches(bytes, SUPERBLOCK_OFFSET, EROFS_MAGIC)) {
    return { container: "raw", content: "erofs", kind: "filesystem", label: CONTENT_LABEL.erofs, packed: false };
  }
  if (matches(bytes, SUPERBLOCK_OFFSET, F2FS_MAGIC)) {
    return { container: "raw", content: "f2fs", kind: "filesystem", label: CONTENT_LABEL.f2fs, packed: false };
  }
  if (matches(bytes, 0, DTB_MAGIC)) {
    return { container: "raw", content: "dtb", kind: "blob", label: CONTENT_LABEL.dtb, packed: false };
  }
  if (matches(bytes, 0, ELF_MAGIC)) {
    return { container: "raw", content: "elf", kind: "blob", label: CONTENT_LABEL.elf, packed: false };
  }

  return { container: "raw", content: "unknown", kind: "blob", label: CONTENT_LABEL.unknown, packed: false };
}
