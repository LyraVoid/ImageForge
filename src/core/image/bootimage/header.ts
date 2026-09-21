import {
  readAscii,
  readCString,
  readUint32LE,
  readUint64LE,
  toHex,
  writeCString,
  writeUint32LE,
  writeUint64LE,
} from "../../binary";
import { ImageParseError, UnsupportedImageError } from "../../errors";
import type { BootImageHeaderFields, VendorBootHeaderFields, VendorRamdiskEntry } from "../types";
import { decodeOsVersion } from "../architecture";
import {
  BOOT_ARGS_SIZE,
  BOOT_EXTRA_ARGS_SIZE,
  BOOT_MAGIC,
  BOOT_MAGIC_SIZE,
  BOOT_NAME_SIZE,
  HEADER_V0_SIZE,
  HEADER_V1_SIZE,
  HEADER_V3_SIZE,
  MAX_HEADER_VERSION,
  VENDOR_BOOT_MAGIC,
  VENDOR_HEADER_V3_SIZE,
  VENDOR_RAMDISK_ENTRY_SIZE,
  VENDOR_RAMDISK_TYPES,
  bootHeaderSizeFor,
} from "./constants";

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const length = Math.floor(clean.length / 2);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Number.parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function readImageMagic(bytes: Uint8Array): string {
  if (bytes.length < BOOT_MAGIC_SIZE) return "";
  return readAscii(bytes, 0, BOOT_MAGIC_SIZE);
}

export function decodeBootHeader(bytes: Uint8Array): BootImageHeaderFields {
  if (bytes.length < HEADER_V0_SIZE) {
    throw new ImageParseError(
      "File is " + bytes.length + " bytes, smaller than the smallest boot header (1632 bytes).",
    );
  }
  const magic = readImageMagic(bytes);
  if (magic !== BOOT_MAGIC) {
    throw new UnsupportedImageError('Boot magic is "' + magic + '", expected "ANDROID!".');
  }
  const headerVersion = readUint32LE(bytes, 40);
  if (headerVersion > MAX_HEADER_VERSION) {
    throw new UnsupportedImageError(
      "Boot header version " + headerVersion + " is newer than the supported version 4.",
    );
  }

  if (headerVersion >= 3) {
    if (bytes.length < HEADER_V3_SIZE) {
      throw new ImageParseError("Truncated v" + headerVersion + " boot header.");
    }
    const headerSize = readUint32LE(bytes, 20);
    const osVersionRaw = readUint32LE(bytes, 16);
    const signatureSize = headerVersion >= 4 ? readUint32LE(bytes, 1580) : 0;
    return {
      kind: "boot",
      magic,
      headerVersion,
      headerSize: headerSize > 0 ? headerSize : bootHeaderSizeFor(headerVersion),
      pageSize: 4096,
      osVersionRaw,
      osVersion: decodeOsVersion(osVersionRaw),
      kernelSize: readUint32LE(bytes, 8),
      kernelAddr: 0,
      ramdiskSize: readUint32LE(bytes, 12),
      ramdiskAddr: 0,
      secondSize: 0,
      secondAddr: 0,
      tagsAddr: 0,
      name: "",
      cmdline: readCString(bytes, 44, BOOT_ARGS_SIZE + BOOT_EXTRA_ARGS_SIZE),
      extraCmdline: "",
      idHex: "",
      recoveryDtboSize: 0,
      recoveryDtboOffset: 0,
      dtbSize: 0,
      dtbAddr: "0",
      signatureSize,
    };
  }

  const headerSize = bootHeaderSizeFor(headerVersion);
  if (headerVersion >= 1 && bytes.length < HEADER_V1_SIZE) {
    throw new ImageParseError("Truncated v" + headerVersion + " boot header.");
  }
  const osVersionRaw = readUint32LE(bytes, 44);
  const recoveryDtboSize = headerVersion >= 1 ? readUint32LE(bytes, 1632) : 0;
  const recoveryDtboOffset = headerVersion >= 1 ? Number(readUint64LE(bytes, 1636)) : 0;
  return {
    kind: "boot",
    magic,
    headerVersion,
    headerSize,
    pageSize: readUint32LE(bytes, 36),
    osVersionRaw,
    osVersion: decodeOsVersion(osVersionRaw),
    kernelSize: readUint32LE(bytes, 8),
    kernelAddr: readUint32LE(bytes, 12),
    ramdiskSize: readUint32LE(bytes, 16),
    ramdiskAddr: readUint32LE(bytes, 20),
    secondSize: readUint32LE(bytes, 24),
    secondAddr: readUint32LE(bytes, 28),
    tagsAddr: readUint32LE(bytes, 32),
    name: readCString(bytes, 48, BOOT_NAME_SIZE),
    cmdline: readCString(bytes, 64, BOOT_ARGS_SIZE),
    extraCmdline: readCString(bytes, 608, BOOT_EXTRA_ARGS_SIZE),
    idHex: toHex(bytes.subarray(576, 608)),
    recoveryDtboSize,
    recoveryDtboOffset,
    dtbSize: headerVersion >= 2 ? readUint32LE(bytes, 1648) : 0,
    dtbAddr: headerVersion >= 2 ? readUint64LE(bytes, 1652).toString() : "0",
    signatureSize: 0,
  };
}

export function encodeBootHeader(fields: BootImageHeaderFields): Uint8Array {
  const size = bootHeaderSizeFor(fields.headerVersion);
  const bytes = new Uint8Array(size);
  writeCString(bytes, 0, BOOT_MAGIC_SIZE, BOOT_MAGIC);

  if (fields.headerVersion >= 3) {
    writeUint32LE(bytes, 8, fields.kernelSize);
    writeUint32LE(bytes, 12, fields.ramdiskSize);
    writeUint32LE(bytes, 16, fields.osVersionRaw);
    writeUint32LE(bytes, 20, size);
    writeUint32LE(bytes, 40, fields.headerVersion);
    writeCString(bytes, 44, BOOT_ARGS_SIZE + BOOT_EXTRA_ARGS_SIZE, fields.cmdline);
    if (fields.headerVersion >= 4) writeUint32LE(bytes, 1580, fields.signatureSize);
    return bytes;
  }

  writeUint32LE(bytes, 8, fields.kernelSize);
  writeUint32LE(bytes, 12, fields.kernelAddr);
  writeUint32LE(bytes, 16, fields.ramdiskSize);
  writeUint32LE(bytes, 20, fields.ramdiskAddr);
  writeUint32LE(bytes, 24, fields.secondSize);
  writeUint32LE(bytes, 28, fields.secondAddr);
  writeUint32LE(bytes, 32, fields.tagsAddr);
  writeUint32LE(bytes, 36, fields.pageSize);
  writeUint32LE(bytes, 40, fields.headerVersion);
  writeUint32LE(bytes, 44, fields.osVersionRaw);
  writeCString(bytes, 48, BOOT_NAME_SIZE, fields.name);
  writeCString(bytes, 64, BOOT_ARGS_SIZE, fields.cmdline);
  const id = hexToBytes(fields.idHex);
  bytes.set(id.subarray(0, 32), 576);
  writeCString(bytes, 608, BOOT_EXTRA_ARGS_SIZE, fields.extraCmdline);
  if (fields.headerVersion >= 1) {
    writeUint32LE(bytes, 1632, fields.recoveryDtboSize);
    writeUint64LE(bytes, 1636, BigInt(Math.max(0, Math.trunc(fields.recoveryDtboOffset))));
    writeUint32LE(bytes, 1644, size);
    if (fields.headerVersion >= 2) {
      writeUint32LE(bytes, 1648, fields.dtbSize);
      writeUint64LE(bytes, 1652, BigInt(fields.dtbAddr || "0"));
    }
  }
  return bytes;
}

export function decodeVendorBootHeader(bytes: Uint8Array): VendorBootHeaderFields {
  if (bytes.length < VENDOR_HEADER_V3_SIZE) {
    throw new ImageParseError("File is smaller than the vendor boot header (2112 bytes).");
  }
  const magic = readImageMagic(bytes);
  if (magic !== VENDOR_BOOT_MAGIC) {
    throw new UnsupportedImageError('Vendor boot magic is "' + magic + '", expected "VNDRBOOT".');
  }
  const headerVersion = readUint32LE(bytes, 8);
  if (headerVersion > MAX_HEADER_VERSION) {
    throw new UnsupportedImageError("Vendor boot header version " + headerVersion + " is not supported.");
  }
  const ramdiskTableEntryNum = headerVersion >= 4 ? readUint32LE(bytes, 2116) : 0;
  const ramdiskTableEntrySize = headerVersion >= 4 ? readUint32LE(bytes, 2120) : 0;
  const ramdiskTableSize = headerVersion >= 4 ? readUint32LE(bytes, 2112) : 0;
  const bootconfigSize = headerVersion >= 4 ? readUint32LE(bytes, 2124) : 0;
  const entrySize = ramdiskTableEntrySize > 0 ? ramdiskTableEntrySize : VENDOR_RAMDISK_ENTRY_SIZE;

  return {
    kind: "vendor_boot",
    magic,
    headerVersion,
    headerSize: readUint32LE(bytes, 2096),
    pageSize: readUint32LE(bytes, 12),
    kernelAddr: readUint32LE(bytes, 16),
    ramdiskAddr: readUint32LE(bytes, 20),
    vendorRamdiskSize: readUint32LE(bytes, 24),
    tagsAddr: readUint32LE(bytes, 2076),
    name: readCString(bytes, 2080, BOOT_NAME_SIZE),
    cmdline: readCString(bytes, 28, 2048),
    dtbSize: readUint32LE(bytes, 2100),
    dtbAddr: readUint64LE(bytes, 2104).toString(),
    ramdiskTableEntryNum,
    ramdiskTableEntrySize: entrySize,
    ramdiskTableSize,
    bootconfigSize,
    ramdiskTable: [],
  };
}

export function parseVendorRamdiskTable(
  data: Uint8Array,
  entryNum: number,
  entrySize: number,
): VendorRamdiskEntry[] {
  const size = entrySize > 0 ? entrySize : VENDOR_RAMDISK_ENTRY_SIZE;
  const table: VendorRamdiskEntry[] = [];
  for (let i = 0; i < entryNum; i += 1) {
    const base = i * size;
    if (base + size > data.length) break;
    const boardId: number[] = [];
    for (let word = 0; word < 16; word += 1) boardId.push(readUint32LE(data, base + 44 + word * 4));
    const type = readUint32LE(data, base + 8);
    table.push({
      index: i,
      ramdiskSize: readUint32LE(data, base),
      ramdiskOffset: readUint32LE(data, base + 4),
      ramdiskType: type,
      ramdiskTypeName: VENDOR_RAMDISK_TYPES[type] ?? "unknown",
      ramdiskName: readCString(data, base + 12, 32),
      boardId,
    });
  }
  return table;
}
