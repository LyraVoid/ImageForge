import { align, isAllZero, readAscii, startsWith } from "../../binary";
import { ImageParseError, UnsupportedImageError, type ImageForgeError } from "../../errors";
import { detectKernelArchitecture } from "../architecture";
import type {
  BootImageHeaderFields,
  ImageSection,
  ParsedBootImage,
  ParsedImage,
  ParsedVendorBootImage,
  SectionName,
  VendorBootHeaderFields,
} from "../types";
import {
  BOOT_MAGIC,
  MAX_SUPPORTED_IMAGE_BYTES,
  MODERN_PAGE_SIZE,
  VENDOR_BOOT_MAGIC,
  VENDOR_RAMDISK_ENTRY_SIZE,
  vendorHeaderSizeFor,
} from "./constants";
import { decodeBootHeader, decodeVendorBootHeader, parseVendorRamdiskTable, readImageMagic } from "./header";

export interface ParseOptions {
  filename?: string;
  maxBytes?: number;
}

interface Region {
  name: SectionName;
  offset: number;
  size: number;
}

/** AVB vbmeta structures start with this magic ("AVB0"). */
export const AVB_MAGIC: readonly number[] = [0x41, 0x56, 0x42, 0x30];

function region(name: SectionName, offset: number, size: number): Region {
  return { name, offset, size };
}

function sliceSection(bytes: Uint8Array, regionSpec: Region, warnings: string[]): ImageSection | null {
  if (regionSpec.size <= 0) return null;
  const end = regionSpec.offset + regionSpec.size;
  if (end > bytes.length) {
    const available = Math.max(0, bytes.length - regionSpec.offset);
    warnings.push(
      regionSpec.name +
        " claims " +
        regionSpec.size +
        " bytes at offset " +
        regionSpec.offset +
        " but only " +
        available +
        " bytes are present; the section was clamped.",
    );
    if (available === 0) return null;
    return {
      name: regionSpec.name,
      offset: regionSpec.offset,
      size: available,
      data: bytes.subarray(regionSpec.offset, bytes.length),
    };
  }
  return {
    name: regionSpec.name,
    offset: regionSpec.offset,
    size: regionSpec.size,
    data: bytes.subarray(regionSpec.offset, end),
  };
}

function guardSize(bytes: Uint8Array, maxBytes: number): void {
  if (bytes.length > maxBytes) {
    throw new UnsupportedImageError(
      "Image is " + bytes.length + " bytes which exceeds the configured limit of " + maxBytes + " bytes.",
    );
  }
}

function parseBootImage(bytes: Uint8Array, header: BootImageHeaderFields, warnings: string[]): ParsedBootImage {
  const pageSize = header.pageSize;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) {
    warnings.push("Page size " + pageSize + " is not a power of two; falling back to 4096 for layout.");
  }
  const page = pageSize >= 512 && (pageSize & (pageSize - 1)) === 0 ? pageSize : MODERN_PAGE_SIZE;

  const regions: Region[] = [];
  let cursor = align(header.headerSize, page);

  if (header.kernelSize > 0) {
    regions.push(region("kernel", cursor, header.kernelSize));
    cursor = align(cursor + header.kernelSize, page);
  }
  if (header.ramdiskSize > 0) {
    regions.push(region("ramdisk", cursor, header.ramdiskSize));
    cursor = align(cursor + header.ramdiskSize, page);
  }
  if (header.secondSize > 0) {
    regions.push(region("second", cursor, header.secondSize));
    cursor = align(cursor + header.secondSize, page);
  }
  if (header.headerVersion >= 1 && header.recoveryDtboSize > 0) {
    const recorded = header.recoveryDtboOffset;
    const useRecorded = recorded >= cursor && recorded + header.recoveryDtboSize <= bytes.length;
    regions.push(region("recovery_dtbo", useRecorded ? recorded : cursor, header.recoveryDtboSize));
    if (!useRecorded) {
      warnings.push("recovery_dtbo_offset is inconsistent with the layout; the section was read sequentially.");
    }
    cursor = align((useRecorded ? recorded : cursor) + header.recoveryDtboSize, page);
  }
  if (header.headerVersion >= 2 && header.dtbSize > 0) {
    const sequential = cursor;
    const fromEnd = bytes.length - header.dtbSize;
    const chosen = sequential + header.dtbSize <= bytes.length ? sequential : Math.max(0, fromEnd);
    regions.push(region("dtb", chosen, header.dtbSize));
    if (chosen !== sequential) {
      warnings.push("dtb was located at the end of the file instead of the sequential offset.");
    }
    cursor = align(chosen + header.dtbSize, page);
  }

  if (header.headerVersion >= 3) {
    const sections: ImageSection[] = [];
    const end = bytes.length - header.signatureSize;

    if (header.signatureSize > 0) {
      sections.push(
        ...collect(bytes, [region("signature", bytes.length - header.signatureSize, header.signatureSize)], warnings),
      );
    }

    if (cursor < end) {
      const trailing = bytes.subarray(cursor, end);
      if (startsWith(trailing, AVB_MAGIC)) {
        // Real GKI boot images keep the AVB vbmeta blob right after the kernel even
        // though signature_size is 0. It is not a bootconfig section.
        sections.push(...collect(bytes, [region("signature", cursor, end - cursor)], warnings));
        warnings.push(
          "An AVB vbmeta blob follows the kernel while signature_size is 0; it was reported as a signature region instead of bootconfig. Any modification invalidates it.",
        );
      } else if (isAllZero(trailing)) {
        warnings.push(end - cursor + " trailing bytes after the last section are all zero padding.");
      } else {
        sections.push(...collect(bytes, [region("bootconfig", cursor, end - cursor)], warnings));
        if (header.signatureSize === 0) {
          warnings.push(
            "The bootconfig region is inferred from the trailing bytes because boot headers do not record its size.",
          );
        }
      }
    }

    const ordered = [...collect(bytes, regions, warnings), ...sections];
    return assembleBootImage(bytes, header, ordered, page, warnings);
  }

  const sections = collect(bytes, regions, warnings);
  if (cursor < bytes.length) {
    warnings.push((bytes.length - cursor) + " trailing bytes follow the last known section.");
  }
  return assembleBootImage(bytes, header, sections, page, warnings);
}

function collect(bytes: Uint8Array, regions: Region[], warnings: string[]): ImageSection[] {
  const sections: ImageSection[] = [];
  for (const spec of regions) {
    const section = sliceSection(bytes, spec, warnings);
    if (section) sections.push(section);
  }
  return sections;
}

function assembleBootImage(
  bytes: Uint8Array,
  header: BootImageHeaderFields,
  sections: ImageSection[],
  page: number,
  warnings: string[],
): ParsedBootImage {
  const kernel = sections.find((section) => section.name === "kernel");
  const guess = detectKernelArchitecture(kernel?.data);
  if (guess.confidence === "none") warnings.push(guess.reason);
  const format: ParsedBootImage["format"] =
    header.headerVersion >= 4 && header.kernelSize === 0 && header.ramdiskSize > 0 ? "init_boot" : "boot";

  return {
    format,
    headerVersion: header.headerVersion,
    pageSize: page,
    headerSize: header.headerSize,
    architecture: guess.architecture,
    osVersion: header.osVersion,
    cmdline: header.headerVersion >= 3 ? header.cmdline : (header.cmdline + " " + header.extraCmdline).trim(),
    name: header.name,
    header,
    sections,
    totalSize: bytes.length,
    warnings,
    source: bytes,
  };
}

function parseVendorBootImage(
  bytes: Uint8Array,
  header: VendorBootHeaderFields,
  warnings: string[],
): ParsedVendorBootImage {
  const page = header.pageSize >= 512 && (header.pageSize & (header.pageSize - 1)) === 0 ? header.pageSize : MODERN_PAGE_SIZE;
  const headerSize = header.headerSize > 0 ? header.headerSize : vendorHeaderSizeFor(header.headerVersion);
  let cursor = align(headerSize, page);
  const regions: Region[] = [];

  if (header.vendorRamdiskSize > 0) {
    regions.push(region("vendor_ramdisk", cursor, header.vendorRamdiskSize));
    cursor = align(cursor + header.vendorRamdiskSize, page);
  }
  if (header.dtbSize > 0) {
    regions.push(region("dtb", cursor, header.dtbSize));
    cursor = align(cursor + header.dtbSize, page);
  }
  if (header.ramdiskTableSize > 0) {
    regions.push(region("vendor_ramdisk_table", cursor, header.ramdiskTableSize));
    cursor = align(cursor + header.ramdiskTableSize, VENDOR_RAMDISK_ENTRY_SIZE);
  }
  if (header.bootconfigSize > 0) {
    regions.push(region("bootconfig", cursor, header.bootconfigSize));
    cursor += header.bootconfigSize;
  }
  if (cursor < bytes.length) {
    warnings.push((bytes.length - cursor) + " trailing bytes follow the last known section.");
  }

  const sections = collect(bytes, regions, warnings);
  const tableSection = sections.find((section) => section.name === "vendor_ramdisk_table");
  if (tableSection && header.ramdiskTableEntryNum > 0) {
    header.ramdiskTable = parseVendorRamdiskTable(
      tableSection.data,
      header.ramdiskTableEntryNum,
      header.ramdiskTableEntrySize,
    );
  }
  const dtb = sections.find((section) => section.name === "dtb");
  const guess = detectKernelArchitecture(dtb?.data);

  return {
    format: "vendor_boot",
    headerVersion: header.headerVersion,
    pageSize: page,
    headerSize,
    architecture: guess.architecture,
    osVersion: "unspecified",
    cmdline: header.cmdline,
    name: header.name,
    header,
    sections,
    totalSize: bytes.length,
    warnings,
    source: bytes,
  };
}

export function detectImageFormat(bytes: Uint8Array): ParsedImage["format"] | "unknown" {
  const magic = readImageMagic(bytes);
  if (magic === BOOT_MAGIC) return "boot";
  if (magic === VENDOR_BOOT_MAGIC) return "vendor_boot";
  return "unknown";
}

export function parseImage(bytes: Uint8Array, options: ParseOptions = {}): ParsedImage {
  guardSize(bytes, options.maxBytes ?? MAX_SUPPORTED_IMAGE_BYTES);
  const magic = readImageMagic(bytes);
  const warnings: string[] = [];

  if (magic === BOOT_MAGIC) {
    const header = decodeBootHeader(bytes);
    return parseBootImage(bytes, header, warnings);
  }
  if (magic === VENDOR_BOOT_MAGIC) {
    const header = decodeVendorBootHeader(bytes);
    return parseVendorBootImage(bytes, header, warnings);
  }
  throw new UnsupportedImageError(
    'Unrecognized image magic "' + readAscii(bytes, 0, Math.min(8, bytes.length)) + '"; expected ANDROID! or VNDRBOOT.',
  );
}

export function tryParseImage(bytes: Uint8Array, options: ParseOptions = {}): { image: ParsedImage } | { error: ImageForgeError } {
  try {
    return { image: parseImage(bytes, options) };
  } catch (error) {
    return { error: error as ImageForgeError };
  }
}

export function assertBootImage(image: ParsedImage): ParsedBootImage {
  if (image.format === "vendor_boot") {
    throw new ImageParseError("Vendor boot images are parsed read-only in this build.");
  }
  return image;
}
