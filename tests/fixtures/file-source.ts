import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { ByteSource } from "@/core/package";

/**
 * A range reader over a file on disk, for tests that use material larger than memory.
 *
 * Node's own `fs.openAsBlob` cannot stand in for a browser `File` here: it reports the size of a
 * file above 4 GiB truncated to 32 bits (an 8,257,215,004 byte package comes back as
 * 3,962,247,708), which is exactly 2^32 short. Browser file handles carry a 64 bit size, so this
 * helper exists to exercise the product path above the {@link ByteSource} boundary.
 */
export function fileSource(path: string): ByteSource {
  return {
    size: statSync(path).size,
    read: async (offset, length) => {
      const fd = openSync(path, "r");
      try {
        const size = statSync(path).size;
        const start = Math.max(0, Math.min(offset, size));
        const end = Math.max(start, Math.min(start + length, size));
        if (end === start) return new Uint8Array(0);
        const buffer = new Uint8Array(end - start);
        const read = readSync(fd, buffer, 0, buffer.length, start);
        return buffer.subarray(0, read);
      } finally {
        closeSync(fd);
      }
    },
  };
}
