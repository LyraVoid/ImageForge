import { PackageError } from "../errors";
import { loadWasmModule } from "../../wasm/loader";

/**
 * Just enough of the zip format to read a vendor image archive or an OTA package: the central
 * directory, the local headers, stored and deflated entries. Zip64 is refused instead of guessed at,
 * because the sizes it moves into an extra field are the ones that decide where an entry's data is.
 */
const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_SENTINEL = 0xffffffff;

export const ZIP_METHOD_STORE = 0;
export const ZIP_METHOD_DEFLATE = 8;

export interface ZipEntry {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - (0xffff + 22));
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readU32(bytes, offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new PackageError(
    "No end-of-central-directory record was found in the last " + Math.min(bytes.length, 0xffff + 22) + " bytes.",
    "This file is not a zip archive.",
  );
}

export function listZip(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22) {
    throw new PackageError(
      "A zip needs at least 22 bytes; this file is " + bytes.length + ".",
      "This file is too short to be a zip archive.",
    );
  }
  const end = findEndOfCentralDirectory(bytes);
  const entryCount = readU16(bytes, end + 10);
  let cursor = readU32(bytes, end + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || readU32(bytes, cursor) !== CENTRAL_HEADER) {
      throw new PackageError(
        "Central directory entry " + (index + 1) + " of " + entryCount + " is damaged.",
        "This zip archive is damaged.",
      );
    }
    const method = readU16(bytes, cursor + 10);
    const crc32 = readU32(bytes, cursor + 16);
    const compressedSize = readU32(bytes, cursor + 20);
    const uncompressedSize = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const commentLength = readU16(bytes, cursor + 32);
    const localHeaderOffset = readU32(bytes, cursor + 42);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      localHeaderOffset === ZIP64_SENTINEL
    ) {
      throw new PackageError(
        "Entry " + name + " keeps its sizes or offset in a zip64 extra field.",
        "Zip64 archives are not supported.",
      );
    }

    entries.push({ name, method, crc32, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryDataOffset(bytes: Uint8Array, entry: ZipEntry): number {
  const cursor = entry.localHeaderOffset;
  if (cursor + 30 > bytes.length || readU32(bytes, cursor) !== LOCAL_HEADER) {
    throw new PackageError(
      "The local header at " + cursor + " is not a local file header.",
      "This zip archive is damaged.",
    );
  }
  // The local header repeats the name and extra lengths, and they can differ from the directory's.
  return cursor + 30 + readU16(bytes, cursor + 26) + readU16(bytes, cursor + 28);
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

export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const start = entryDataOffset(bytes, entry);
  const stored = bytes.subarray(start, start + entry.compressedSize);
  if (stored.length !== entry.compressedSize) {
    throw new PackageError(
      entry.name + " claims " + entry.compressedSize + " bytes at " + start + " but only " + stored.length + " remain.",
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
