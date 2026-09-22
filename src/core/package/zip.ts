import { PackageError } from "../errors";
import { loadWasmModule } from "../../wasm/loader";
import { bytesSource, readPrefix } from "./source";
import type { ByteSource } from "./source";

/**
 * Enough of the zip format to read a vendor image archive or an OTA package: the end record (zip32
 * and zip64), the central directory, the local headers, stored and deflated entries. Deflated
 * entries are expanded with `DecompressionStream("deflate-raw")`; everything is read as ranges, so a
 * package larger than memory can still be listed and picked apart.
 */
const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EXTRA_FIELD = 0x0001;
const ZIP64_SENTINEL = 0xffffffff;
const ZIP64_SENTINEL_16 = 0xffff;

/**
 * How much of the tail is read to find the end record. The format allows a 65,535 byte comment
 * after it, and vendor packages (SignApk in-place signing) append their own trailer on top, so the
 * window is twice that.
 */
const END_RECORD_WINDOW = 0xffff + 22 + 76 + 0xffff;

export const ZIP_METHOD_STORE = 0;
export const ZIP_METHOD_DEFLATE = 8;

export interface ZipEntry {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Where the entry's data starts, in the archive. */
  dataOffset: number;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readU64(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  const value = view.getBigUint64(0, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PackageError("A zip64 field is larger than this build can address.");
  }
  return Number(value);
}

interface EndRecord {
  entryCount: number;
  centralSize: number;
  centralOffset: number;
}

async function readEndRecord(source: ByteSource): Promise<EndRecord> {
  const windowLength = Math.min(END_RECORD_WINDOW, source.size);
  const tail = await source.read(source.size - windowLength, windowLength);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (readU32(tail, index) === END_OF_CENTRAL_DIRECTORY) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    throw new PackageError(
      "No end-of-central-directory record was found in the last " + windowLength + " bytes.",
      "This file is not a zip archive.",
    );
  }

  const record: EndRecord = {
    entryCount: readU16(tail, eocd + 10),
    centralSize: readU32(tail, eocd + 12),
    centralOffset: readU32(tail, eocd + 16),
  };

  // zip64: the locator sits right before the end record and points at the real record
  const locator = eocd - 20;
  if (locator >= 0 && readU32(tail, locator) === ZIP64_LOCATOR) {
    const eocd64Offset = readU64(tail, locator + 8);
    const record64 = await source.read(eocd64Offset, 56);
    if (record64.length < 56 || readU32(record64, 0) !== ZIP64_END_OF_CENTRAL_DIRECTORY) {
      throw new PackageError(
        "The zip64 locator points at " + eocd64Offset + ", which holds no zip64 end record.",
        "This zip archive is damaged.",
      );
    }
    record.entryCount = readU64(record64, 32);
    record.centralSize = readU64(record64, 40);
    record.centralOffset = readU64(record64, 48);
  } else if (record.entryCount === ZIP64_SENTINEL_16 || record.centralOffset === ZIP64_SENTINEL) {
    throw new PackageError(
      "The end record uses zip64 sentinels but there is no zip64 locator.",
      "This zip archive is damaged.",
    );
  }
  return record;
}

export async function listZip(source: ByteSource): Promise<ZipEntry[]> {
  if (source.size < 22) {
    throw new PackageError(
      "A zip needs at least 22 bytes; this file is " + source.size + ".",
      "This file is too short to be a zip archive.",
    );
  }
  const end = await readEndRecord(source);
  const central = await source.read(end.centralOffset, end.centralSize);
  if (central.length !== end.centralSize) {
    throw new PackageError(
      "The central directory claims " + end.centralSize + " bytes but only " + central.length + " were read.",
      "This zip archive is truncated.",
    );
  }

  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < end.entryCount; index += 1) {
    if (cursor + 46 > central.length || readU32(central, cursor) !== CENTRAL_HEADER) {
      throw new PackageError(
        "Central directory entry " + (index + 1) + " of " + end.entryCount + " is damaged.",
        "This zip archive is damaged.",
      );
    }
    const method = readU16(central, cursor + 10);
    const crc32 = readU32(central, cursor + 16);
    let compressedSize = readU32(central, cursor + 20);
    let uncompressedSize = readU32(central, cursor + 24);
    const nameLength = readU16(central, cursor + 28);
    const extraLength = readU16(central, cursor + 30);
    const commentLength = readU16(central, cursor + 32);
    let localHeaderOffset = readU32(central, cursor + 42);
    const name = new TextDecoder().decode(central.subarray(cursor + 46, cursor + 46 + nameLength));

    // zip64 extra field: the values replace the sentinel fields, in this order
    let extra = cursor + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = readU16(central, extra);
      const length = readU16(central, extra + 2);
      if (id === ZIP64_EXTRA_FIELD) {
        let field = extra + 4;
        if (uncompressedSize === ZIP64_SENTINEL) {
          uncompressedSize = readU64(central, field);
          field += 8;
        }
        if (compressedSize === ZIP64_SENTINEL) {
          compressedSize = readU64(central, field);
          field += 8;
        }
        if (localHeaderOffset === ZIP64_SENTINEL) {
          localHeaderOffset = readU64(central, field);
        }
      }
      extra += 4 + length;
    }

    const header = await source.read(localHeaderOffset, 30);
    if (header.length < 30 || readU32(header, 0) !== LOCAL_HEADER) {
      throw new PackageError(
        "The local header of " + name + " at " + localHeaderOffset + " is not a local file header.",
        "This zip archive is damaged.",
      );
    }
    // The local header repeats the name and extra lengths, and they can differ from the directory's.
    const dataOffset = localHeaderOffset + 30 + readU16(header, 26) + readU16(header, 28);

    entries.push({ name, method, crc32, compressedSize, uncompressedSize, dataOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * The bytes of a stored entry, as a source of their own. This is how a payload inside an OTA zip is
 * read in place: no part of the 8 GiB file is copied.
 */
export function storedEntrySource(source: ByteSource, entry: ZipEntry): ByteSource {
  if (entry.method !== ZIP_METHOD_STORE) {
    throw new PackageError(
      entry.name + " is deflated, so it can only be read whole.",
      "This zip entry is compressed and cannot be opened in place.",
    );
  }
  return {
    size: entry.uncompressedSize,
    read: (offset, length) => source.read(entry.dataOffset + offset, length),
  };
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new PackageError(
      "DecompressionStream is unavailable in this environment.",
      "This browser cannot expand deflated zip entries.",
    );
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads one entry out. Refuses an entry too large to hold, so a caller is not surprised by 8 GiB. */
export async function readZipEntry(
  source: ByteSource,
  entry: ZipEntry,
  limit = 256 * 1024 * 1024,
): Promise<Uint8Array> {
  if (entry.uncompressedSize > limit) {
    throw new PackageError(
      entry.name + " expands to " + entry.uncompressedSize + " bytes, above the " + limit + " byte limit.",
      "This entry is too large to read into memory; open it as a package instead of extracting it.",
    );
  }
  const stored = await source.read(entry.dataOffset, entry.compressedSize);
  if (stored.length !== entry.compressedSize) {
    throw new PackageError(
      entry.name +
        " claims " +
        entry.compressedSize +
        " bytes at " +
        entry.dataOffset +
        " but only " +
        stored.length +
        " were read.",
      "This zip archive is truncated.",
    );
  }

  let data: Uint8Array;
  if (entry.method === ZIP_METHOD_STORE) data = stored;
  else if (entry.method === ZIP_METHOD_DEFLATE) data = await inflateRaw(stored);
  else {
    throw new PackageError(
      entry.name + " uses compression method " + entry.method + ".",
      "This zip entry uses a compression this build cannot expand.",
    );
  }

  if (data.length !== entry.uncompressedSize) {
    throw new PackageError(
      entry.name + " expanded to " + data.length + " bytes, the archive declares " + entry.uncompressedSize + ".",
      "This zip entry does not match its declared size.",
    );
  }
  const wasm = await loadWasmModule();
  const actual = wasm.crc32(data) >>> 0;
  if (actual !== entry.crc32) {
    throw new PackageError(
      entry.name + ": declared CRC32 0x" + entry.crc32.toString(16) + ", computed 0x" + actual.toString(16) + ".",
      "This zip entry does not match its CRC32.",
    );
  }
  return data;
}

/** A source over bytes that are already in memory, for the tests and for small entries. */
export function memorySource(bytes: Uint8Array): ByteSource {
  return bytesSource(bytes);
}

export { readPrefix };
