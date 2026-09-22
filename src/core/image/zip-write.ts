import { PackageError } from "../errors";
import { loadWasmModule } from "../../wasm/loader";

/**
 * A minimal zip writer, enough to hand a set of files to the user as one archive: stored entries
 * (no compression, the contents are already-compressed pictures), a fixed timestamp so the same
 * input produces the same bytes, and CRC32 for every entry. The reader in `../package/zip.ts` reads
 * it back, and `unzip -t` accepts it, which is what the tests check.
 */
export interface ZipWriteEntry {
  /** Path inside the archive; forward slashes, no leading slash. */
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_METHOD_STORE = 0;
/** 1980-01-01 00:00:00, the earliest a zip can represent, so archives are reproducible. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function writeU16(out: Uint8Array, at: number, value: number): void {
  out[at] = value & 0xff;
  out[at + 1] = (value >>> 8) & 0xff;
}

function writeU32(out: Uint8Array, at: number, value: number): void {
  out[at] = value & 0xff;
  out[at + 1] = (value >>> 8) & 0xff;
  out[at + 2] = (value >>> 16) & 0xff;
  out[at + 3] = (value >>> 24) & 0xff;
}

export async function buildZip(entries: ZipWriteEntry[]): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw new PackageError("An archive with no entries has nothing to hold.", "There is nothing to export.");
  }
  if (entries.length > 0xffff) {
    throw new PackageError(
      "A zip without zip64 holds at most " + 0xffff + " entries; this has " + entries.length + ".",
      "Too many files for one archive.",
    );
  }
  const wasm = await loadWasmModule();
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => ({
    nameBytes: encoder.encode(entry.name),
    data: entry.data,
    crc: wasm.crc32(entry.data) >>> 0,
  }));

  const localSize = prepared.reduce(
    (sum, entry) => sum + 30 + entry.nameBytes.length + entry.data.length,
    0,
  );
  const centralSize = prepared.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
  const total = localSize + centralSize + 22;
  if (total > 0xffffffff) {
    throw new PackageError(
      "The archive would be " + total + " bytes, which needs zip64.",
      "This export is too large for one archive.",
    );
  }
  const out = new Uint8Array(total);
  const offsets: number[] = [];
  let cursor = 0;

  for (const entry of prepared) {
    offsets.push(cursor);
    writeU32(out, cursor, LOCAL_HEADER);
    writeU16(out, cursor + 4, 20);
    writeU16(out, cursor + 6, 0);
    writeU16(out, cursor + 8, ZIP_METHOD_STORE);
    writeU16(out, cursor + 10, DOS_TIME);
    writeU16(out, cursor + 12, DOS_DATE);
    writeU32(out, cursor + 14, entry.crc);
    writeU32(out, cursor + 18, entry.data.length);
    writeU32(out, cursor + 22, entry.data.length);
    writeU16(out, cursor + 26, entry.nameBytes.length);
    writeU16(out, cursor + 28, 0);
    out.set(entry.nameBytes, cursor + 30);
    out.set(entry.data, cursor + 30 + entry.nameBytes.length);
    cursor += 30 + entry.nameBytes.length + entry.data.length;
  }

  const centralStart = cursor;
  prepared.forEach((entry, index) => {
    writeU32(out, cursor, CENTRAL_HEADER);
    writeU16(out, cursor + 4, 20);
    writeU16(out, cursor + 6, 20);
    writeU16(out, cursor + 8, 0);
    writeU16(out, cursor + 10, ZIP_METHOD_STORE);
    writeU16(out, cursor + 12, DOS_TIME);
    writeU16(out, cursor + 14, DOS_DATE);
    writeU32(out, cursor + 16, entry.crc);
    writeU32(out, cursor + 20, entry.data.length);
    writeU32(out, cursor + 24, entry.data.length);
    writeU16(out, cursor + 28, entry.nameBytes.length);
    writeU16(out, cursor + 30, 0);
    writeU16(out, cursor + 32, 0);
    writeU16(out, cursor + 34, 0);
    writeU16(out, cursor + 36, 0);
    writeU32(out, cursor + 38, 0);
    writeU32(out, cursor + 42, offsets[index]);
    out.set(entry.nameBytes, cursor + 46);
    cursor += 46 + entry.nameBytes.length;
  });

  writeU32(out, cursor, END_OF_CENTRAL_DIRECTORY);
  writeU16(out, cursor + 4, 0);
  writeU16(out, cursor + 6, 0);
  writeU16(out, cursor + 8, prepared.length);
  writeU16(out, cursor + 10, prepared.length);
  writeU32(out, cursor + 12, centralSize);
  writeU32(out, cursor + 16, centralStart);
  writeU16(out, cursor + 20, 0);
  return out;
}
