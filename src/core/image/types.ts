export type ImageFormat = "boot" | "init_boot" | "vendor_boot";

export type SectionName =
  | "kernel"
  | "ramdisk"
  | "second"
  | "recovery_dtbo"
  | "dtb"
  | "bootconfig"
  | "signature"
  | "vendor_ramdisk"
  | "vendor_ramdisk_table";

export interface ImageSection {
  name: SectionName;
  offset: number;
  size: number;
  data: Uint8Array;
  sha256?: string;
}

export interface BootImageHeaderFields {
  kind: "boot";
  magic: string;
  headerVersion: number;
  headerSize: number;
  pageSize: number;
  osVersionRaw: number;
  osVersion: string;
  kernelSize: number;
  kernelAddr: number;
  ramdiskSize: number;
  ramdiskAddr: number;
  secondSize: number;
  secondAddr: number;
  tagsAddr: number;
  name: string;
  cmdline: string;
  extraCmdline: string;
  idHex: string;
  recoveryDtboSize: number;
  recoveryDtboOffset: number;
  dtbSize: number;
  dtbAddr: string;
  signatureSize: number;
}

export interface VendorRamdiskEntry {
  index: number;
  ramdiskSize: number;
  ramdiskOffset: number;
  ramdiskType: number;
  ramdiskTypeName: string;
  ramdiskName: string;
  boardId: number[];
}

export interface VendorBootHeaderFields {
  kind: "vendor_boot";
  magic: string;
  headerVersion: number;
  headerSize: number;
  pageSize: number;
  kernelAddr: number;
  ramdiskAddr: number;
  vendorRamdiskSize: number;
  tagsAddr: number;
  name: string;
  cmdline: string;
  dtbSize: number;
  dtbAddr: string;
  ramdiskTableEntryNum: number;
  ramdiskTableEntrySize: number;
  ramdiskTableSize: number;
  bootconfigSize: number;
  ramdiskTable: VendorRamdiskEntry[];
}

export interface ParsedBootImage {
  format: "boot" | "init_boot";
  headerVersion: number;
  pageSize: number;
  headerSize: number;
  architecture: string | null;
  osVersion: string;
  cmdline: string;
  name: string;
  header: BootImageHeaderFields;
  sections: ImageSection[];
  totalSize: number;
  warnings: string[];
  /** The bytes this image was parsed from, for providers that have to hash the source. */
  source?: Uint8Array;
}

export interface ParsedVendorBootImage {
  format: "vendor_boot";
  headerVersion: number;
  pageSize: number;
  headerSize: number;
  architecture: string | null;
  osVersion: string;
  cmdline: string;
  name: string;
  header: VendorBootHeaderFields;
  sections: ImageSection[];
  totalSize: number;
  warnings: string[];
  /** The bytes this image was parsed from, for providers that have to hash the source. */
  source?: Uint8Array;
}

export type ParsedImage = ParsedBootImage | ParsedVendorBootImage;

export interface AndroidImage {
  format: ImageFormat;
  headerVersion: number;
  architecture?: string;
  kernel?: Uint8Array;
  ramdisk?: Uint8Array;
  dtb?: Uint8Array;
  metadata?: Uint8Array;
}

export function sectionOf(image: ParsedImage, name: SectionName): ImageSection | undefined {
  return image.sections.find((section) => section.name === name);
}

export function sectionNames(image: ParsedImage): SectionName[] {
  return image.sections.filter((section) => section.size > 0).map((section) => section.name);
}

export function toAndroidImage(image: ParsedImage): AndroidImage {
  const normalized: AndroidImage = {
    format: image.format,
    headerVersion: image.headerVersion,
  };
  if (image.architecture) normalized.architecture = image.architecture;
  const kernel = sectionOf(image, "kernel");
  if (kernel && kernel.size > 0) normalized.kernel = kernel.data;
  const ramdisk = sectionOf(image, "ramdisk") ?? sectionOf(image, "vendor_ramdisk");
  if (ramdisk && ramdisk.size > 0) normalized.ramdisk = ramdisk.data;
  const dtb = sectionOf(image, "dtb");
  if (dtb && dtb.size > 0) normalized.dtb = dtb.data;
  const metadata = sectionOf(image, "bootconfig") ?? sectionOf(image, "vendor_ramdisk_table");
  if (metadata && metadata.size > 0) normalized.metadata = metadata.data;
  return normalized;
}
