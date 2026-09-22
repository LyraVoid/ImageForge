import { PackageError } from "../errors";
import { loadWasmModule } from "../../wasm/loader";

/**
 * The gzip dialect OPPO's splash frames use: a fixed ten byte header (no name, no mtime, OS = Unix),
 * a raw deflate payload, and the CRC32 and ISIZE footer. The bytes come from the reference tooling
 * the frames were produced with, and the bootloader reads them back with a plain inflate.
 */
export const GZIP_HEADER = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);

export async function encodeGzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new PackageError(
      "CompressionStream is unavailable in this environment.",
      "This browser cannot compress the frames of a splash image.",
    );
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const deflated = new Uint8Array(await new Response(stream).arrayBuffer());
  const wasm = await loadWasmModule();
  const out = new Uint8Array(GZIP_HEADER.length + deflated.length + 8);
  out.set(GZIP_HEADER, 0);
  out.set(deflated, GZIP_HEADER.length);
  const view = new DataView(out.buffer);
  view.setUint32(GZIP_HEADER.length + deflated.length, wasm.crc32(data) >>> 0, true);
  view.setUint32(GZIP_HEADER.length + deflated.length + 4, data.length >>> 0, true);
  return out;
}

export async function decodeGzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new PackageError(
      "DecompressionStream is unavailable in this environment.",
      "This browser cannot expand gzip streams.",
    );
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
