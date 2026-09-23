import { formatBytes } from "../binary";
import { sha256Hex } from "../hash";
import {
  COMPRESSION_LABEL,
  decompressSection,
  describeCompression,
  detectCompression,
  isDecompressionSupported,
} from "./compression";
import { findEntry, isCpio, parseCpio } from "./cpio";
import type { CpioArchive } from "./cpio";
import type { ImageSection, ParsedImage } from "./types";
import { sectionOf } from "./types";

export interface ReportField {
  label: string;
  value: string;
  hint?: string;
}

export interface ReportGroup {
  id: string;
  title: string;
  fields: ReportField[];
}

export interface ImageReport {
  groups: ReportGroup[];
  technical: ReportGroup;
  compression: string;
  architecture: string;
  sectionSummary: Array<{ name: string; offset: number; size: number; sizeLabel: string; sha256: string }>;
  /** Patch programs that already left their marks in this image, read from the image itself. */
  existingPatch?: string[];
}

/** The magic a KernelPatch core image carries; finding it means the kernel is already patched. */
const KERNELPATCH_MAGIC = "KP1158";

/** The sentence the report shows for a kernel that already carries that magic. */
const KERNELPATCH_FOUND = "KernelPatch (APatch or one of its forks): the kernel carries KP1158";

/**
 * Looks for the marks known patch programs leave behind, so that stacking a second root solution on
 * top of an existing one is a visible decision rather than an accident. Everything here comes from
 * the image being analysed: a ramdisk entry, or the magic inside a kernel that is not compressed.
 */
function detectExistingPatch(image: ParsedImage, archive: CpioArchive | undefined): string[] {
  const found: string[] = [];

  const kernel = sectionOf(image, "kernel");
  if (kernel && kernel.size > 0 && detectCompression(kernel.data) === "unknown") {
    if (new TextDecoder("latin1").decode(kernel.data).includes(KERNELPATCH_MAGIC)) {
      found.push(KERNELPATCH_FOUND);
    }
  }

  if (archive) {
    if (archive.entries.some((entry) => entry.name === ".backup/.magisk" || entry.name.startsWith("overlay.d/"))) {
      found.push("Magisk: overlay.d/ or .backup/.magisk is in the ramdisk");
    }
    if (findEntry(archive, "kernelsu.ko")) found.push("KernelSU: kernelsu.ko is in the ramdisk");
    if (findEntry(archive, "init.real")) found.push("a previous ramdisk patch kept init.real");
  }

  return found;
}

function field(label: string, value: string, hint?: string): ReportField {
  const entry: ReportField = { label, value };
  if (hint !== undefined) entry.hint = hint;
  return entry;
}

function sectionLabel(section: ImageSection): string {
  return section.name + " (" + section.offset + ".." + (section.offset + section.size) + ")";
}

export async function buildImageReport(
  image: ParsedImage,
  options: { sourceName?: string; sourceSize?: number } = {},
): Promise<ImageReport> {
  const ramdisk = sectionOf(image, "ramdisk") ?? sectionOf(image, "vendor_ramdisk");
  const compression = ramdisk ? detectCompression(ramdisk.data) : "none";
  const kernel = sectionOf(image, "kernel");
  let ramdiskArchive: CpioArchive | undefined;

  const imageFields: ReportField[] = [];
  if (options.sourceName) imageFields.push(field("File", options.sourceName));
  imageFields.push(field("Size", formatBytes(options.sourceSize ?? image.totalSize)));
  imageFields.push(field("Format", image.format === "vendor_boot" ? "Android Vendor Boot Image" : "Android Boot Image"));
  imageFields.push(field("Header", "v" + image.headerVersion));
  imageFields.push(field("Page size", formatBytes(image.pageSize)));

  const bootFields: ReportField[] = [
    field("OS version", image.osVersion),
    field("Cmdline", image.cmdline.trim() === "" ? "(empty)" : image.cmdline.trim()),
  ];
  if (image.name) bootFields.push(field("Image name", image.name));
  if (image.header.kind === "boot") {
    bootFields.push(field("Kernel address", "0x" + image.header.kernelAddr.toString(16)));
    bootFields.push(field("Ramdisk address", "0x" + image.header.ramdiskAddr.toString(16)));
    bootFields.push(field("Tags address", "0x" + image.header.tagsAddr.toString(16)));
    if (image.header.secondSize > 0) bootFields.push(field("Second stage", formatBytes(image.header.secondSize)));
  }

  const kernelFields: ReportField[] = [
    field("Architecture", image.architecture ?? "undetermined", image.architecture ? undefined : "The kernel payload is compressed or uses an unknown container."),
    field("Payload", kernel ? formatBytes(kernel.size) : "absent"),
  ];

  const ramdiskFields: ReportField[] = [
    field("Payload", ramdisk ? formatBytes(ramdisk.size) : "absent"),
    field("Compression", COMPRESSION_LABEL[compression]),
  ];
  if (ramdisk && isDecompressionSupported(compression)) {
    try {
      const expanded = await decompressSection(ramdisk.data, describeCompression(ramdisk.data));
      ramdiskFields.push(field("Expanded size", formatBytes(expanded.length)));

      if (isCpio(expanded)) {
        const archive = parseCpio(expanded);
        ramdiskArchive = archive;
        const kinds = { directory: 0, file: 0, link: 0, other: 0 };
        for (const entry of archive.entries) {
          const type = (entry.mode & 0o170000) >>> 12;
          if (type === 4) kinds.directory += 1;
          else if (type === 8) kinds.file += 1;
          else if (type === 10) kinds.link += 1;
          else kinds.other += 1;
        }
        ramdiskFields.push(field("Archive", archive.format === "crc" ? "CPIO newc (crc)" : "CPIO newc"));
        ramdiskFields.push(field("Entries", String(archive.entries.length)));
        // Counts are separate fields rather than one English sentence: a sentence would have to be
        // rebuilt per language (and per plural), while a label and a number can be translated.
        ramdiskFields.push(field("Directories", String(kinds.directory)));
        ramdiskFields.push(field("Files", String(kinds.file)));
        ramdiskFields.push(field("Symlinks", String(kinds.link)));
        if (kinds.other > 0) ramdiskFields.push(field("Other entries", String(kinds.other)));
      } else {
        ramdiskFields.push(
          field("Archive", "not a CPIO archive", "Android ramdisks are normally CPIO newc archives."),
        );
      }
    } catch (error) {
      ramdiskFields.push(field("Expanded size", "unavailable", error instanceof Error ? error.message : undefined));
    }
  } else if (ramdisk && !isDecompressionSupported(compression)) {
    ramdiskFields.push(
      field("Expanded size", "not supported", "This build cannot expand " + COMPRESSION_LABEL[compression] + " payloads."),
    );
  }

  const metadataFields: ReportField[] = [];
  const bootconfig = sectionOf(image, "bootconfig");
  metadataFields.push(field("Bootconfig", bootconfig ? formatBytes(bootconfig.size) : "absent"));
  if (image.header.kind === "boot") {
    metadataFields.push(
      field("Recovery DTBO", image.header.recoveryDtboSize > 0 ? formatBytes(image.header.recoveryDtboSize) : "absent"),
    );
    metadataFields.push(field("DTB", image.header.dtbSize > 0 ? formatBytes(image.header.dtbSize) : "absent"));
    metadataFields.push(
      field("AVB signature", image.header.signatureSize > 0 ? formatBytes(image.header.signatureSize) : "absent"),
    );
    if (image.header.idHex) metadataFields.push(field("Image id", image.header.idHex.slice(0, 16) + "..."));
  } else {
    metadataFields.push(field("Vendor ramdisk entries", String(image.header.ramdiskTable.length)));
    metadataFields.push(field("Vendor ramdisk table", formatBytes(image.header.ramdiskTableSize)));
  }

  const technicalFields: ReportField[] = [
    field("Magic", image.header.magic),
    field("Header size", image.headerSize + " bytes"),
    field("Total size", image.totalSize + " bytes"),
  ];
  if (image.header.kind === "boot") {
    technicalFields.push(field("os_version raw", "0x" + image.header.osVersionRaw.toString(16)));
    technicalFields.push(field("kernel_size", String(image.header.kernelSize)));
    technicalFields.push(field("ramdisk_size", String(image.header.ramdiskSize)));
    technicalFields.push(field("second_size", String(image.header.secondSize)));
    technicalFields.push(field("recovery_dtbo_offset", String(image.header.recoveryDtboOffset)));
    technicalFields.push(field("dtb_addr", image.header.dtbAddr));
    technicalFields.push(field("signature_size", String(image.header.signatureSize)));
  } else {
    technicalFields.push(field("vendor_ramdisk_size", String(image.header.vendorRamdiskSize)));
    technicalFields.push(field("dtb_size", String(image.header.dtbSize)));
    technicalFields.push(field("ramdisk_table_entry_size", String(image.header.ramdiskTableEntrySize)));
    for (const entry of image.header.ramdiskTable) {
      technicalFields.push(
        field(
          "table[" + entry.index + "]",
          entry.ramdiskName + " type=" + entry.ramdiskTypeName + " size=" + entry.ramdiskSize + " offset=" + entry.ramdiskOffset,
        ),
      );
    }
  }

  const sectionSummary: ImageReport["sectionSummary"] = [];
  for (const section of image.sections) {
    const digest = await sha256Hex(section.data);
    technicalFields.push(field(sectionLabel(section), digest));
    sectionSummary.push({
      name: section.name,
      offset: section.offset,
      size: section.size,
      sizeLabel: formatBytes(section.size),
      sha256: digest,
    });
  }
  for (const warning of image.warnings) technicalFields.push(field("warning", warning));

  const existingPatch = detectExistingPatch(image, ramdiskArchive);
  if (existingPatch.length > 0) metadataFields.push(field("Existing patch", existingPatch.join("; ")));

  return {
    groups: [
      { id: "image", title: "Image", fields: imageFields },
      { id: "boot", title: "Boot", fields: bootFields },
      { id: "kernel", title: "Kernel", fields: kernelFields },
      { id: "ramdisk", title: "Ramdisk", fields: ramdiskFields },
      { id: "metadata", title: "Metadata", fields: metadataFields },
    ],
    technical: { id: "technical", title: "Technical details", fields: technicalFields },
    compression: COMPRESSION_LABEL[compression],
    architecture: image.architecture ?? "undetermined",
    sectionSummary,
    ...(existingPatch.length === 0 ? {} : { existingPatch }),
  };
}
