/**
 * A byte range provider. Small files can be a `Uint8Array`, but a package is 8 GiB: the only way to
 * read one is to ask for the ranges that matter. Everything in `src/core/package` works against this
 * interface, which is what keeps an 8 GiB OTA out of the heap.
 */
export interface ByteSource {
  readonly size: number;
  /** Reads up to `length` bytes at `offset`; a short read means the source ended. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Bytes that are already in memory. The returned ranges are views, not copies. */
export function bytesSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset, length) => {
      const start = Math.max(0, Math.min(offset, bytes.length));
      const end = Math.max(start, Math.min(start + length, bytes.length));
      return bytes.subarray(start, end);
    },
  };
}

/**
 * A file on disk, read through `Blob.slice`. In the browser a `File` from a file input is a handle,
 * not a buffer, so this is how an 8 GiB package is opened without loading it.
 */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => {
      const start = Math.max(0, Math.min(offset, blob.size));
      const end = Math.max(start, Math.min(start + length, blob.size));
      if (end === start) return new Uint8Array(0);
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
}

/** A window onto another source: this is how a payload inside a zip is read in place. */
export function subSource(parent: ByteSource, offset: number, size: number): ByteSource {
  return {
    size,
    read: (at, length) => {
      // Clamped to the window: reading a nested payload must not run into what follows it.
      const start = Math.max(0, Math.min(at, size));
      const end = Math.max(start, Math.min(start + length, size));
      if (end === start) return Promise.resolve(new Uint8Array(0));
      return parent.read(offset + start, end - start);
    },
  };
}

/** Reads everything. Only for sources that are known to be small. */
export async function readAll(source: ByteSource, limit = 256 * 1024 * 1024): Promise<Uint8Array> {
  if (source.size > limit) {
    throw new Error(
      "This source is " + source.size + " bytes, above the " + limit + " byte limit for reading it whole.",
    );
  }
  return source.read(0, source.size);
}

/** Reads a fixed size header, tolerating a shorter source. */
export async function readPrefix(source: ByteSource, length: number): Promise<Uint8Array> {
  return source.read(0, Math.min(length, source.size));
}
