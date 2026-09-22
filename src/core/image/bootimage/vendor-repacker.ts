import { align, writeUint32LE } from "../../binary";
import type { ParsedVendorBootImage, VendorRamdiskEntry } from "../types";
import { sectionOf } from "../types";
import { VENDOR_RAMDISK_ENTRY_SIZE, VENDOR_RAMDISK_NAME_SIZE } from "./constants";

export interface RepackVendorBootRequest {
  image: ParsedVendorBootImage;
  /**
   * Replacements for vendor ramdisk fragments. ImageForge patches the platform fragment (the one
   * that carries init); every other fragment is kept byte for byte.
   */
  fragments?: Array<{ index: number; data: Uint8Array }>;
  /** Zero pad the output to this size, for example to keep a whole-partition image size. */
  padTo?: number;
}

export interface RepackVendorBootOutcome {
  bytes: Uint8Array;
  warnings: string[];
}

/** Offsets inside the vendor boot header, exactly where decodeVendorBootHeader reads them. */
const FIELD = {
  headerSize: 2096,
  dtbSize: 2100,
  vendorRamdiskSize: 24,
  tableSize: 2112,
  tableEntryNum: 2116,
  tableEntrySize: 2120,
  bootconfigSize: 2124,
} as const;

/**
 * Writes one vendor ramdisk table entry: size, offset, type, a 32 byte name and sixteen board id
 * words, which is the 108 byte layout v4 defines.
 */
function writeEntry(out: Uint8Array, offset: number, entry: VendorRamdiskEntry, boardIdWords: number): void {
  writeUint32LE(out, offset, entry.ramdiskSize);
  writeUint32LE(out, offset + 4, entry.ramdiskOffset);
  writeUint32LE(out, offset + 8, entry.ramdiskType);
  const name = new TextEncoder().encode(entry.ramdiskName.slice(0, VENDOR_RAMDISK_NAME_SIZE - 1));
  out.set(name, offset + 12);
  for (let word = 0; word < boardIdWords; word += 1) {
    writeUint32LE(out, offset + 12 + VENDOR_RAMDISK_NAME_SIZE + word * 4, entry.boardId[word] ?? 0);
  }
}

export function encodeVendorRamdiskTable(entries: readonly VendorRamdiskEntry[], entrySize = VENDOR_RAMDISK_ENTRY_SIZE): Uint8Array {
  const size = entrySize > 0 ? entrySize : VENDOR_RAMDISK_ENTRY_SIZE;
  const boardIdWords = Math.max(0, Math.floor((size - 12 - VENDOR_RAMDISK_NAME_SIZE) / 4));
  const out = new Uint8Array(entries.length * size);
  entries.forEach((entry, index) => writeEntry(out, index * size, entry, boardIdWords));
  return out;
}

/**
 * Rebuilds a vendor boot image around one or more replaced vendor ramdisk fragments.
 *
 * The layout of the source image is preserved rather than recomputed: every section keeps its
 * original offset shifted by however much the vendor ramdisk grew or shrank, gaps and padding
 * included. The table is authoritative for where each fragment lives, so the fragments themselves
 * are packed tightly and the table records their new offsets.
 */
export function repackVendorBootImage(request: RepackVendorBootRequest): RepackVendorBootOutcome {
  const { image } = request;
  const warnings: string[] = [];
  const source = image.source;
  if (source === undefined) {
    throw new Error("The parsed image does not carry its source bytes, so it cannot be repacked.");
  }

  const page = image.pageSize;
  const headerSize = image.headerSize;
  const regionSection = sectionOf(image, "vendor_ramdisk");
  const oldRegion = regionSection?.data ?? new Uint8Array(0);

  // Fragments: the table when there is one, otherwise the region is a single ramdisk.
  const entries: VendorRamdiskEntry[] =
    image.header.ramdiskTable.length > 0
      ? image.header.ramdiskTable.map((entry) => ({ ...entry }))
      : [
          {
            index: 0,
            ramdiskSize: oldRegion.length,
            ramdiskOffset: 0,
            ramdiskType: 1,
            ramdiskTypeName: "platform",
            ramdiskName: "",
            boardId: [],
          },
        ];

  const replacements = new Map<number, Uint8Array>((request.fragments ?? []).map((entry) => [entry.index, entry.data]));
  for (const index of replacements.keys()) {
    if (index < 0 || index >= entries.length) {
      throw new Error("Fragment " + index + " does not exist; the image has " + entries.length + ".");
    }
  }

  const pieces: Uint8Array[] = [];
  let cursor = 0;
  entries.forEach((entry, index) => {
    const data = replacements.get(index) ?? oldRegion.subarray(entry.ramdiskOffset, entry.ramdiskOffset + entry.ramdiskSize);
    entry.ramdiskOffset = cursor;
    entry.ramdiskSize = data.length;
    pieces.push(data);
    cursor += data.length;
  });
  const newRegion = new Uint8Array(cursor);
  let regionCursor = 0;
  for (const piece of pieces) {
    newRegion.set(piece, regionCursor);
    regionCursor += piece.length;
  }
  const delta = newRegion.length - oldRegion.length;

  const newTable =
    image.header.headerVersion >= 4 && image.header.ramdiskTableEntryNum > 0
      ? encodeVendorRamdiskTable(entries, image.header.ramdiskTableEntrySize)
      : new Uint8Array(0);

  // The layout is recomputed with the rule the parser reads images by (and that AOSP documents):
  // vendor ramdisk at the page aligned end of the header, then a page aligned dtb, then the table,
  // then a four byte aligned bootconfig. Recomputing keeps the produced image self consistent even
  // when the source image carried extra padding of its own, which cannot be preserved once a
  // section changes size anyway.
  const dtbSection = sectionOf(image, "dtb");
  const bootconfigSection = sectionOf(image, "bootconfig");
  const regionOffset = align(headerSize, page);
  const dtbOffset = dtbSection && dtbSection.size > 0 ? align(regionOffset + newRegion.length, page) : 0;
  const tableOffset = newTable.length > 0 ? align(dtbOffset + (dtbSection?.size ?? 0), page) : 0;
  const bootconfigOffset = bootconfigSection ? align(tableOffset + newTable.length, VENDOR_RAMDISK_ENTRY_SIZE) : 0;
  const contentEnd = Math.max(
    regionOffset + newRegion.length,
    tableOffset + newTable.length,
    bootconfigOffset + (bootconfigSection?.size ?? 0),
  );
  const requestedPad = request.padTo !== undefined && Number.isFinite(request.padTo) ? Math.max(0, Math.trunc(request.padTo)) : 0;
  // Compact by default, exactly like the boot image repacker: padTo is what preserves a partition
  // sized file, and it can never shrink the result below its content.
  const totalSize = Math.max(contentEnd, requestedPad);
  const out = new Uint8Array(totalSize);

  // Header: copied verbatim, then the fields the new content changes.
  out.set(source.subarray(0, Math.min(headerSize, source.length)), 0);
  writeUint32LE(out, FIELD.vendorRamdiskSize, newRegion.length);
  if (image.header.headerVersion >= 4) {
    writeUint32LE(out, FIELD.tableSize, newTable.length);
    writeUint32LE(out, FIELD.tableEntryNum, newTable.length > 0 ? entries.length : 0);
    writeUint32LE(out, FIELD.tableEntrySize, image.header.ramdiskTableEntrySize || VENDOR_RAMDISK_ENTRY_SIZE);
    writeUint32LE(out, FIELD.bootconfigSize, bootconfigSection?.size ?? 0);
  }

  out.set(newRegion, regionOffset);
  if (dtbSection && dtbSection.size > 0) out.set(dtbSection.data, dtbOffset);
  if (newTable.length > 0) out.set(newTable, tableOffset);
  if (bootconfigSection && bootconfigSection.size > 0) out.set(bootconfigSection.data, bootconfigOffset);
  void delta;

  if (requestedPad > contentEnd) {
    warnings.push(
      "The output was zero padded from " + contentEnd + " to " + requestedPad + " bytes so it keeps the size of the original image.",
    );
  }
  if (delta !== 0) {
    warnings.push(
      "The vendor ramdisk changed by " + (delta > 0 ? "+" : "") + delta + " bytes; every later section moved with it.",
    );
  }

  return { bytes: out, warnings };
}
