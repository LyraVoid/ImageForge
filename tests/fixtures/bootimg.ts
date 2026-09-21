import { align, writeCString, writeUint32LE, writeUint64LE } from "@/core/binary";

export const ARM64_KERNEL_MAGIC = 0x644d5241;

export function deterministicBytes(size: number, seed = 7): Uint8Array {
  const out = new Uint8Array(size);
  let value = seed;
  for (let i = 0; i < size; i += 1) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (value >> 16) & 0xff;
  }
  return out;
}

export function makeKernel(size = 4096, magic = true): Uint8Array {
  const kernel = deterministicBytes(size, 3);
  if (magic && size >= 60) writeUint32LE(kernel, 56, ARM64_KERNEL_MAGIC);
  return kernel;
}

export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function makeRamdisk(payloadSize = 2048, compressed = true): Promise<Uint8Array> {
  const payload = deterministicBytes(payloadSize, 11);
  return compressed ? await gzipBytes(payload) : payload;
}

export interface BootImageFixtureOptions {
  headerVersion?: number;
  pageSize?: number;
  kernel?: Uint8Array | null;
  ramdisk?: Uint8Array | null;
  second?: Uint8Array | null;
  recoveryDtbo?: Uint8Array | null;
  dtb?: Uint8Array | null;
  bootconfig?: Uint8Array | null;
  cmdline?: string;
  extraCmdline?: string;
  name?: string;
  osVersionRaw?: number;
  signatureSize?: number;
  /** Appended after the last section without touching signature_size, like real GKI images. */
  trailing?: Uint8Array;
}

export function bootHeaderSize(headerVersion: number): number {
  if (headerVersion >= 4) return 1584;
  if (headerVersion === 3) return 1580;
  if (headerVersion === 2) return 1660;
  if (headerVersion === 1) return 1648;
  return 1632;
}

export async function buildBootImage(options: BootImageFixtureOptions = {}): Promise<Uint8Array> {
  const headerVersion = options.headerVersion ?? 4;
  const pageSize = headerVersion >= 3 ? 4096 : (options.pageSize ?? 4096);
  const headerSize = bootHeaderSize(headerVersion);
  const kernel = options.kernel === undefined ? makeKernel(4096) : options.kernel;
  const ramdisk = options.ramdisk === undefined ? await makeRamdisk() : options.ramdisk;
  const second = options.second ?? null;
  const recoveryDtbo = options.recoveryDtbo ?? null;
  const dtb = options.dtb ?? null;
  const bootconfig = options.bootconfig ?? null;
  const cmdline = options.cmdline ?? "console=ttyMSM0,115200n8 androidboot.hardware=imageforge";
  const extraCmdline = options.extraCmdline ?? "";
  const name = options.name ?? "boot";

  const ordered: Array<{ name: string; data: Uint8Array }> = [];
  if (kernel && kernel.length > 0) ordered.push({ name: "kernel", data: kernel });
  if (ramdisk && ramdisk.length > 0) ordered.push({ name: "ramdisk", data: ramdisk });
  if (headerVersion < 3) {
    if (second && second.length > 0) ordered.push({ name: "second", data: second });
    if (recoveryDtbo && recoveryDtbo.length > 0) ordered.push({ name: "recovery_dtbo", data: recoveryDtbo });
    if (dtb && dtb.length > 0) ordered.push({ name: "dtb", data: dtb });
  } else if (bootconfig && bootconfig.length > 0) {
    ordered.push({ name: "bootconfig", data: bootconfig });
  }

  const placed: Array<{ name: string; offset: number; data: Uint8Array }> = [];
  let cursor = align(headerSize, pageSize);
  for (const entry of ordered) {
    const offset = align(cursor, pageSize);
    placed.push({ name: entry.name, offset, data: entry.data });
    cursor = offset + entry.data.length;
  }
  const bodyEnd = align(cursor, pageSize);
  const trailing = options.trailing ?? null;
  const trailingEnd = trailing ? bodyEnd + trailing.length : bodyEnd;
  const signature =
    headerVersion >= 4 && options.signatureSize ? deterministicBytes(options.signatureSize, 23) : null;
  const total = signature ? trailingEnd + signature.length : trailingEnd;
  const out = new Uint8Array(total);

  writeCString(out, 0, 8, "ANDROID!");
  if (headerVersion >= 3) {
    writeUint32LE(out, 8, kernel ? kernel.length : 0);
    writeUint32LE(out, 12, ramdisk ? ramdisk.length : 0);
    writeUint32LE(out, 16, options.osVersionRaw ?? 0);
    writeUint32LE(out, 20, headerSize);
    writeUint32LE(out, 40, headerVersion);
    writeCString(out, 44, 1536, cmdline);
    if (headerVersion >= 4) writeUint32LE(out, 1580, signature ? signature.length : 0);
  } else {
    writeUint32LE(out, 8, kernel ? kernel.length : 0);
    writeUint32LE(out, 12, 0x10008000);
    writeUint32LE(out, 16, ramdisk ? ramdisk.length : 0);
    writeUint32LE(out, 20, 0x11000000);
    writeUint32LE(out, 24, second ? second.length : 0);
    writeUint32LE(out, 28, 0x10f00000);
    writeUint32LE(out, 32, 0x10000100);
    writeUint32LE(out, 36, pageSize);
    writeUint32LE(out, 40, headerVersion);
    writeUint32LE(out, 44, options.osVersionRaw ?? 0);
    writeCString(out, 48, 16, name);
    writeCString(out, 64, 512, cmdline);
    for (let i = 0; i < 32; i += 1) out[576 + i] = (i * 7) & 0xff;
    writeCString(out, 608, 1024, extraCmdline);
    if (headerVersion >= 1) {
      const recovery = placed.find((entry) => entry.name === "recovery_dtbo");
      writeUint32LE(out, 1632, recoveryDtbo ? recoveryDtbo.length : 0);
      writeUint64LE(out, 1636, BigInt(recovery ? recovery.offset : 0));
      writeUint32LE(out, 1644, headerSize);
      if (headerVersion >= 2) {
        writeUint32LE(out, 1648, dtb ? dtb.length : 0);
        writeUint64LE(out, 1652, BigInt(dtb ? dtb.length : 0));
      }
    }
  }

  for (const entry of placed) out.set(entry.data, entry.offset);
  if (trailing) out.set(trailing, bodyEnd);
  if (signature) out.set(signature, trailingEnd);
  return out;
}

export interface VendorBootFixtureOptions {
  headerVersion?: number;
  vendorRamdisk?: Uint8Array;
  dtb?: Uint8Array | null;
  bootconfig?: Uint8Array | null;
  cmdline?: string;
  name?: string;
}

export async function buildVendorBootImage(options: VendorBootFixtureOptions = {}): Promise<Uint8Array> {
  const headerVersion = options.headerVersion ?? 4;
  const pageSize = 4096;
  const headerSize = headerVersion >= 4 ? 2128 : 2112;
  const vendorRamdisk = options.vendorRamdisk ?? (await makeRamdisk(1024));
  const dtb = options.dtb ?? deterministicBytes(512, 41);
  const bootconfig = options.bootconfig ?? null;
  const cmdline = options.cmdline ?? "androidboot.hardware=imageforge";

  const table = new Uint8Array(108);
  writeUint32LE(table, 0, vendorRamdisk.length);
  writeUint32LE(table, 4, 0);
  writeUint32LE(table, 8, 1);
  writeCString(table, 12, 32, "default");

  const regions: Array<{ name: string; data: Uint8Array }> = [{ name: "vendor_ramdisk", data: vendorRamdisk }];
  if (dtb.length > 0) regions.push({ name: "dtb", data: dtb });
  if (headerVersion >= 4) regions.push({ name: "vendor_ramdisk_table", data: table });
  if (bootconfig && bootconfig.length > 0) regions.push({ name: "bootconfig", data: bootconfig });

  const placed: Array<{ name: string; offset: number }> = [];
  let cursor = align(headerSize, pageSize);
  for (const entry of regions) {
    const offset = align(cursor, pageSize);
    placed.push({ name: entry.name, offset });
    cursor = align(offset + entry.data.length, 108);
  }
  const total = align(cursor, pageSize);
  const out = new Uint8Array(total);

  writeCString(out, 0, 8, "VNDRBOOT");
  writeUint32LE(out, 8, headerVersion);
  writeUint32LE(out, 12, pageSize);
  writeUint32LE(out, 16, 0x10008000);
  writeUint32LE(out, 20, 0x11000000);
  writeUint32LE(out, 24, vendorRamdisk.length);
  writeCString(out, 28, 2048, cmdline);
  writeUint32LE(out, 2076, 0x10000100);
  writeCString(out, 2080, 16, options.name ?? "vendor_boot");
  writeUint32LE(out, 2096, headerSize);
  writeUint32LE(out, 2100, dtb.length);
  writeUint64LE(out, 2104, BigInt(dtb.length));
  if (headerVersion >= 4) {
    writeUint32LE(out, 2112, table.length);
    writeUint32LE(out, 2116, 1);
    writeUint32LE(out, 2120, 108);
    writeUint32LE(out, 2124, bootconfig ? bootconfig.length : 0);
  }

  for (let i = 0; i < regions.length; i += 1) {
    const offset = placed[i].offset;
    if (regions[i].name === "vendor_ramdisk_table") out.set(table, offset);
    else out.set(regions[i].data, offset);
  }
  return out;
}
