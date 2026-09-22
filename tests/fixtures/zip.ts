import { crc32 } from "@/wasm/fallback";

export interface ZipFixtureEntry {
  name: string;
  data: Uint8Array;
  /** Deflate the entry instead of storing it, the way real archives do. */
  deflate?: boolean;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function writeU16(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
  out[offset + 2] = (value >>> 16) & 0xff;
  out[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Builds a zip an independent implementation can read: local headers, a central directory and an
 * end record, with a correct CRC32 and deflate where asked for. It exists so the zip reader is
 * tested against a second writer, not against itself.
 */
export async function buildZip(entries: ZipFixtureEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const prepared: Array<{ name: Uint8Array; data: Uint8Array; raw: Uint8Array; method: number; crc: number }> = [];
  for (const entry of entries) {
    const raw = entry.data;
    const data = entry.deflate ? await deflateRaw(raw) : raw;
    prepared.push({
      name: encoder.encode(entry.name),
      data,
      raw,
      method: entry.deflate ? 8 : 0,
      crc: crc32(raw) >>> 0,
    });
  }

  const localSize = prepared.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
  const centralSize = prepared.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  let cursor = 0;
  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(cursor);
    writeU32(out, cursor, 0x04034b50);
    writeU16(out, cursor + 4, 20);
    writeU16(out, cursor + 6, 0);
    writeU16(out, cursor + 8, entry.method);
    writeU16(out, cursor + 10, 0);
    writeU16(out, cursor + 12, 0);
    writeU32(out, cursor + 14, entry.crc);
    writeU32(out, cursor + 18, entry.data.length);
    writeU32(out, cursor + 22, entry.raw.length);
    writeU16(out, cursor + 26, entry.name.length);
    writeU16(out, cursor + 28, 0);
    out.set(entry.name, cursor + 30);
    out.set(entry.data, cursor + 30 + entry.name.length);
    cursor += 30 + entry.name.length + entry.data.length;
  }

  const centralStart = cursor;
  prepared.forEach((entry, index) => {
    writeU32(out, cursor, 0x02014b50);
    writeU16(out, cursor + 4, 20);
    writeU16(out, cursor + 6, 20);
    writeU16(out, cursor + 8, 0);
    writeU16(out, cursor + 10, entry.method);
    writeU16(out, cursor + 12, 0);
    writeU16(out, cursor + 14, 0);
    writeU32(out, cursor + 16, entry.crc);
    writeU32(out, cursor + 20, entry.data.length);
    writeU32(out, cursor + 24, entry.raw.length);
    writeU16(out, cursor + 28, entry.name.length);
    writeU16(out, cursor + 30, 0);
    writeU16(out, cursor + 32, 0);
    writeU16(out, cursor + 34, 0);
    writeU16(out, cursor + 36, 0);
    writeU32(out, cursor + 38, 0);
    writeU32(out, cursor + 42, offsets[index]);
    out.set(entry.name, cursor + 46);
    cursor += 46 + entry.name.length;
  });

  writeU32(out, cursor, 0x06054b50);
  writeU16(out, cursor + 4, 0);
  writeU16(out, cursor + 6, 0);
  writeU16(out, cursor + 8, prepared.length);
  writeU16(out, cursor + 10, prepared.length);
  writeU32(out, cursor + 12, centralSize);
  writeU32(out, cursor + 16, centralStart);
  writeU16(out, cursor + 20, 0);
  return out;
}
