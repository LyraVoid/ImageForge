import { PackageError } from "../errors";
import type { ByteSource } from "../package/source";
import { decodeBootHeader, decodeVendorBootHeader } from "../image/bootimage/header";

/**
 * Comparing two images byte by byte, and saying which part of a boot image each difference falls in.
 *
 * This is the tool every other conclusion in this project is checked with: patches are verified by
 * comparing the result with the original, an OTA extraction is checked against a device dump the same
 * way, and a diff that reaches outside the section it should touch is the first sign something moved
 * that was not meant to.
 */
export interface DiffRange {
  start: number;
  length: number;
}

export interface DiffResult {
  sizeA: number;
  sizeB: number;
  identical: boolean;
  /** The runs of differing bytes, merged when they are close together. */
  ranges: DiffRange[];
  differingBytes: number;
  /** True when the range list stopped at the cap: the byte count is still exact. */
  truncated: boolean;
}

export interface DiffOptions {
  chunkBytes?: number;
  /** Differences closer together than this are reported as one range. */
  mergeGap?: number;
  maxRanges?: number;
}

const DEFAULT_CHUNK = 1024 * 1024;
const DEFAULT_GAP = 64;
const DEFAULT_MAX_RANGES = 200;

export async function diffSources(
  a: ByteSource,
  b: ByteSource,
  options: DiffOptions = {},
): Promise<DiffResult> {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK;
  const mergeGap = options.mergeGap ?? DEFAULT_GAP;
  const maxRanges = options.maxRanges ?? DEFAULT_MAX_RANGES;
  const shortest = Math.min(a.size, b.size);

  const ranges: DiffRange[] = [];
  let differingBytes = 0;
  let truncated = false;

  const addRange = (start: number, length: number): void => {
    const last = ranges.at(-1);
    if (last && start - (last.start + last.length) <= mergeGap) {
      // close enough to the previous run: one range, as a reader would see it
      last.length = start + length - last.start;
      return;
    }
    if (ranges.length >= maxRanges) {
      truncated = true;
      return;
    }
    ranges.push({ start, length });
  };

  for (let offset = 0; offset < shortest; offset += chunkBytes) {
    const length = Math.min(chunkBytes, shortest - offset);
    const left = await a.read(offset, length);
    const right = await b.read(offset, length);
    let at = 0;
    while (at < length) {
      if (left[at] === right[at]) {
        at += 1;
        continue;
      }
      const start = at;
      while (at < length && left[at] !== right[at]) at += 1;
      differingBytes += at - start;
      addRange(offset + start, at - start);
    }
  }

  // a longer file differs from the end of the shorter one to its own end
  if (a.size !== b.size) {
    const tail = Math.abs(a.size - b.size);
    differingBytes += tail;
    if (tail > 0) addRange(shortest, tail);
  }

  return {
    sizeA: a.size,
    sizeB: b.size,
    identical: differingBytes === 0,
    ranges,
    differingBytes,
    truncated,
  };
}

export interface NamedSection {
  name: string;
  start: number;
  end: number;
}

export interface DiffSection extends NamedSection {
  differingBytes: number;
  ranges: DiffRange[];
}

export interface SectionedDiff {
  kind: "boot" | "init_boot" | "vendor_boot";
  pageSize: number;
  sections: DiffSection[];
  /** Bytes that fall outside every named section: padding, and the tail of a partition dump. */
  outside: DiffSection;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * The sections of a boot image, in the order they sit in the file. The header declares sizes, not
 * offsets, so each section starts where the previous one ends, rounded up to the page size.
 */
export async function bootSections(source: ByteSource): Promise<NamedSection[] | null> {
  const head = await source.read(0, Math.min(source.size, 4096));
  try {
    const magic = new TextDecoder().decode(head.subarray(0, 8));
    if (magic === "VNDRBOOT") {
      const header = decodeVendorBootHeader(head);
      const pageSize = header.pageSize || 4096;
      const sections: NamedSection[] = [];
      let cursor = alignUp(header.headerSize, pageSize);
      sections.push({ name: "header", start: 0, end: cursor });
      const vendorRamdisk = (header as unknown as { vendorRamdiskSize?: number }).vendorRamdiskSize ?? 0;
      if (vendorRamdisk > 0) {
        sections.push({ name: "vendor ramdisk", start: cursor, end: cursor + vendorRamdisk });
        cursor += vendorRamdisk;
      }
      const dtb = header.dtbSize ?? 0;
      if (dtb > 0) {
        sections.push({ name: "dtb", start: cursor, end: cursor + dtb });
        cursor += dtb;
      }
      return sections;
    }
    if (magic !== "ANDROID!") return null;
    const header = decodeBootHeader(head);
    const pageSize = header.pageSize || 4096;
    const sections: NamedSection[] = [];
    let cursor = 0;
    sections.push({ name: "header", start: 0, end: alignUp(header.headerSize, pageSize) });
    cursor = alignUp(header.headerSize, pageSize);
    if (header.kernelSize > 0) {
      sections.push({ name: "kernel", start: cursor, end: cursor + header.kernelSize });
      cursor += header.kernelSize;
    }
    if (header.ramdiskSize > 0) {
      sections.push({ name: "ramdisk", start: cursor, end: cursor + header.ramdiskSize });
      cursor += header.ramdiskSize;
    }
    return sections;
  } catch (error) {
    if (error instanceof PackageError) return null;
    return null;
  }
}

/** Maps a diff's ranges onto the sections of the image, so a report can say what moved. */
export function sectionDiff(ranges: DiffRange[], sections: NamedSection[], totalBytes: number): DiffSection[] {
  const out: DiffSection[] = [];
  for (const section of sections) {
    const inside = ranges
      .map((range) => ({
        start: Math.max(range.start, section.start),
        end: Math.min(range.start + range.length, section.end),
      }))
      .filter((range) => range.end > range.start)
      .map((range) => ({ start: range.start, length: range.end - range.start }));
    const differingBytes = inside.reduce((sum, range) => sum + range.length, 0);
    out.push({ ...section, differingBytes, ranges: inside });
  }
  // every byte of a run that no named section covers: padding, and the tail of a partition dump
  const outsideRanges: DiffRange[] = [];
  for (const range of ranges) {
    let cursor = range.start;
    const end = range.start + range.length;
    const covering = sections
      .filter((section) => section.end > cursor && section.start < end)
      .sort((left, right) => left.start - right.start);
    for (const section of covering) {
      if (section.start > cursor) {
        outsideRanges.push({ start: cursor, length: Math.min(section.start, end) - cursor });
      }
      cursor = Math.max(cursor, section.end);
      if (cursor >= end) break;
    }
    if (cursor < end) outsideRanges.push({ start: cursor, length: end - cursor });
  }
  const outsideStart = outsideRanges.length > 0 ? (outsideRanges[0].start as number) : totalBytes;
  const outsideEnd = outsideRanges.reduce((max, range) => Math.max(max, range.start + range.length), outsideStart);
  out.push({
    name: "outside any section",
    start: outsideStart,
    end: outsideEnd,
    differingBytes: outsideRanges.reduce((sum, range) => sum + range.length, 0),
    ranges: outsideRanges,
  });
  return out;
}
