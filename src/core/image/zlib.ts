import { PackageError } from "../errors";

/**
 * zlib, which is how MediaTek's logo blocks are compressed (and not gzip, which splash frames use).
 * The browser's own codecs do the work: "deflate" is the zlib wrapper, "deflate-raw" the bare stream.
 */
export async function decodeZlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new PackageError(
      "DecompressionStream is unavailable in this environment.",
      "This browser cannot expand zlib streams.",
    );
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeZlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new PackageError(
      "CompressionStream is unavailable in this environment.",
      "This browser cannot compress zlib streams.",
    );
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
