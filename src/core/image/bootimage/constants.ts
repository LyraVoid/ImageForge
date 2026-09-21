export const BOOT_MAGIC = "ANDROID!";
export const VENDOR_BOOT_MAGIC = "VNDRBOOT";

export const BOOT_MAGIC_SIZE = 8;
export const BOOT_NAME_SIZE = 16;
export const BOOT_ARGS_SIZE = 512;
export const BOOT_EXTRA_ARGS_SIZE = 1024;

export const HEADER_V0_SIZE = 1632;
export const HEADER_V1_SIZE = 1648;
export const HEADER_V2_SIZE = 1660;
export const HEADER_V3_SIZE = 1580;
export const HEADER_V4_SIZE = 1584;

export const VENDOR_HEADER_V3_SIZE = 2112;
export const VENDOR_HEADER_V4_SIZE = 2128;
export const VENDOR_RAMDISK_ENTRY_SIZE = 108;

export const MODERN_PAGE_SIZE = 4096;
export const MAX_HEADER_VERSION = 4;

export const MAX_SUPPORTED_IMAGE_BYTES = 512 * 1024 * 1024;

export const VENDOR_RAMDISK_TYPES: Record<number, string> = {
  0: "none",
  1: "platform",
  2: "recovery",
  3: "dlkm",
};

export function bootHeaderSizeFor(headerVersion: number): number {
  if (headerVersion >= 4) return HEADER_V4_SIZE;
  if (headerVersion === 3) return HEADER_V3_SIZE;
  if (headerVersion === 2) return HEADER_V2_SIZE;
  if (headerVersion === 1) return HEADER_V1_SIZE;
  return HEADER_V0_SIZE;
}

export function vendorHeaderSizeFor(headerVersion: number): number {
  return headerVersion >= 4 ? VENDOR_HEADER_V4_SIZE : VENDOR_HEADER_V3_SIZE;
}
