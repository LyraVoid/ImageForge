/**
 * CPIO "newc" archives, which is what Android ramdisks contain.
 *
 * Everything a producer wrote is preserved, including the padding bytes after a name and after
 * the payload data, so parsing and writing an untouched archive reproduces the original bytes.
 */
export interface CpioEntry {
  name: string;
  ino: number;
  mode: number;
  uid: number;
  gid: number;
  nlink: number;
  mtime: number;
  devmajor: number;
  devminor: number;
  rdevmajor: number;
  rdevminor: number;
  check: number;
  data: Uint8Array;
  namePadding?: Uint8Array;
  dataPadding?: Uint8Array;
}

export interface CpioArchive {
  format: "newc" | "crc";
  entries: CpioEntry[];
  /**
   * The TRAILER entry, kept with the fields the producer wrote. Producers disagree about the
   * header values of the trailer (for example nlink), so it is preserved instead of rebuilt.
   */
  trailer: CpioEntry;
  /** Bytes that follow the TRAILER entry; some ramdisks pad the archive. */
  trailing: Uint8Array;
}

export const CPIO_TRAILER = "TRAILER!!!";

const NEWC_MAGIC = "070701";
const CRC_MAGIC = "070702";
const HEADER_LENGTH = 110;

const HEX = "0123456789abcdef";

export function isCpio(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_LENGTH) return false;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  return magic === NEWC_MAGIC || magic === CRC_MAGIC;
}

function readHex(bytes: Uint8Array, offset: number, length = 8): number {
  let value = 0;
  for (let i = 0; i < length; i += 1) {
    const code = bytes[offset + i];
    let digit: number;
    if (code >= 0x30 && code <= 0x39) digit = code - 0x30;
    else if (code >= 0x61 && code <= 0x66) digit = code - 0x61 + 10;
    else if (code >= 0x41 && code <= 0x46) digit = code - 0x41 + 10;
    else throw new Error("Invalid hex digit in a CPIO header at offset " + (offset + i) + ".");
    value = value * 16 + digit;
  }
  return value >>> 0;
}

function writeHex(bytes: Uint8Array, offset: number, value: number): void {
  let remaining = value >>> 0;
  for (let i = 7; i >= 0; i -= 1) {
    bytes[offset + i] = HEX.charCodeAt(remaining % 16);
    remaining = Math.floor(remaining / 16);
  }
}

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

export function parseCpio(bytes: Uint8Array): CpioArchive {
  if (!isCpio(bytes)) {
    throw new Error("The payload does not start with a CPIO newc header.");
  }
  const format = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]) === CRC_MAGIC
    ? "crc"
    : "newc";

  const entries: CpioEntry[] = [];
  let cursor = 0;

  while (cursor + HEADER_LENGTH <= bytes.length) {
    const magic = String.fromCharCode(
      bytes[cursor], bytes[cursor + 1], bytes[cursor + 2],
      bytes[cursor + 3], bytes[cursor + 4], bytes[cursor + 5],
    );
    if (magic !== NEWC_MAGIC && magic !== CRC_MAGIC) {
      throw new Error("Unexpected CPIO magic " + JSON.stringify(magic) + " at offset " + cursor + ".");
    }

    // Thirteen eight byte hex fields follow the six byte magic.
    const field = (index: number): number => readHex(bytes, cursor + 6 + index * 8);
    const ino = field(0);
    const mode = field(1);
    const uid = field(2);
    const gid = field(3);
    const nlink = field(4);
    const mtime = field(5);
    const filesize = field(6);
    const devmajor = field(7);
    const devminor = field(8);
    const rdevmajor = field(9);
    const rdevminor = field(10);
    const namesize = field(11);
    const check = field(12);

    const headerEnd = cursor + HEADER_LENGTH;
    if (namesize === 0 || headerEnd + namesize > bytes.length) {
      throw new Error("Truncated CPIO entry name at offset " + cursor + ".");
    }
    let nameEnd = headerEnd + namesize;
    while (nameEnd > headerEnd && bytes[nameEnd - 1] === 0) nameEnd -= 1;
    const name = new TextDecoder().decode(bytes.subarray(headerEnd, nameEnd));

    const namePadLength = pad4(HEADER_LENGTH + namesize);
    const dataStart = headerEnd + namesize + namePadLength;
    if (dataStart + filesize > bytes.length) {
      throw new Error("CPIO entry " + name + " claims " + filesize + " bytes past the end of the archive.");
    }
    const dataPadLength = pad4(filesize);
    const dataEnd = dataStart + filesize;
    const entryEnd = dataEnd + dataPadLength;

    const parsed: CpioEntry = {
      name,
      ino,
      mode,
      uid,
      gid,
      nlink,
      mtime,
      devmajor,
      devminor,
      rdevmajor,
      rdevminor,
      check,
      data: bytes.subarray(dataStart, dataEnd),
      namePadding: bytes.subarray(headerEnd + namesize, dataStart),
      dataPadding: bytes.subarray(dataEnd, entryEnd),
    };

    if (name === CPIO_TRAILER) {
      return {
        format,
        entries,
        trailer: parsed,
        trailing: bytes.subarray(entryEnd),
      };
    }

    entries.push(parsed);
    cursor = entryEnd;
  }

  throw new Error("The CPIO archive has no TRAILER entry.");
}

export function serializeCpio(archive: CpioArchive): Uint8Array {
  const parts: Uint8Array[] = [];

  const emit = (entry: CpioEntry): void => {
    const name = entry.name;
    const data = entry.data;
    const nameBytes = new TextEncoder().encode(name);
    const namesize = nameBytes.length + 1;

    const header = new Uint8Array(HEADER_LENGTH);
    header.set(new TextEncoder().encode(archive.format === "crc" ? CRC_MAGIC : NEWC_MAGIC), 0);
    writeHex(header, 6, entry.ino);
    writeHex(header, 14, entry.mode);
    writeHex(header, 22, entry.uid);
    writeHex(header, 30, entry.gid);
    writeHex(header, 38, entry.nlink);
    writeHex(header, 46, entry.mtime);
    writeHex(header, 54, data.length);
    writeHex(header, 62, entry.devmajor);
    writeHex(header, 70, entry.devminor);
    writeHex(header, 78, entry.rdevmajor);
    writeHex(header, 86, entry.rdevminor);
    writeHex(header, 94, namesize);
    writeHex(header, 102, entry.check);

    const nameField = new Uint8Array(namesize);
    nameField.set(nameBytes, 0);
    const namePad = pad4(HEADER_LENGTH + namesize);
    const dataPad = pad4(data.length);

    parts.push(header, nameField, new Uint8Array(namePad), data, new Uint8Array(dataPad));
  };

  for (const entry of archive.entries) emit(entry);
  emit(archive.trailer);
  parts.push(archive.trailing);

  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function findEntry(archive: CpioArchive, name: string): CpioEntry | undefined {
  return archive.entries.find((entry) => entry.name === name);
}

/**
 * Replaces an entry payload (and optionally its mode), or appends a new regular file entry.
 * Omitting the mode keeps the mode an existing entry already had.
 */
export function upsertEntry(archive: CpioArchive, name: string, data: Uint8Array, mode?: number): void {
  const existing = findEntry(archive, name);
  if (existing) {
    existing.data = data;
    if (mode !== undefined) existing.mode = mode;
    return;
  }
  archive.entries.push({
    name,
    ino: 0,
    mode: mode ?? 0o100644,
    uid: 0,
    gid: 0,
    nlink: 1,
    mtime: 0,
    devmajor: 0,
    devminor: 0,
    rdevmajor: 0,
    rdevminor: 0,
    check: 0,
    data,
  });
}

/**
 * Renames an entry, which is how the KernelSU flow keeps the original init around
 * (init becomes init.real). Refuses when the target name is taken, so a caller can tell
 * "already patched" apart from "renaming worked".
 */
export function renameEntry(archive: CpioArchive, from: string, to: string): boolean {
  const entry = findEntry(archive, from);
  if (!entry) return false;
  if (findEntry(archive, to)) return false;
  entry.name = to;
  return true;
}

export function removeEntry(archive: CpioArchive, name: string): boolean {
  const index = archive.entries.findIndex((entry) => entry.name === name);
  if (index < 0) return false;
  archive.entries.splice(index, 1);
  return true;
}
