/*
 * The decompression half of the reference bzip2, exposed to WebAssembly.
 *
 * ImageForge reads bzip2 streams out of OTA payloads (REPLACE_BZ operations), and the streams are
 * whatever the vendor's tooling wrote. A hand written decoder disagrees with one of them, so the
 * reference implementation is compiled in and used instead: this shim only adds the entry point and
 * the concatenated stream loop the command line tool performs.
 */
#include "bzlib.h"

/*
 * bzip2 reports its own internal inconsistencies through this hook, and the default implementation
 * prints to stderr and calls exit(3): inside a WebAssembly module that would trap and poison the
 * instance for every later call. It is defined here to record the failure instead, and the entry
 * point below turns that into a plain -1 so a corrupt stream fails like any other bad input.
 */
static volatile int bz2_internal_failure = 0;

void bz_internal_error(int errcode) {
  (void)errcode;
  bz2_internal_failure = 1;
}

/*
 * Decompresses src into dst. Returns the number of bytes written, -1 when a stream is malformed, or
 * -2 when the destination filled up first (so the caller can retry with a larger buffer).
 */
long long bz2_decompress(const unsigned char *src, unsigned int srcLen, unsigned char *dst,
                         unsigned int dstCap) {
  unsigned int inPos = 0;
  unsigned int outPos = 0;

  while (inPos < srcLen) {
    bz_stream stream;
    stream.bzalloc = 0;
    stream.bzfree = 0;
    stream.opaque = 0;
    stream.next_in = (char *)src + inPos;
    stream.avail_in = srcLen - inPos;

    if (BZ2_bzDecompressInit(&stream, 0, 0) != BZ_OK) {
      return -1;
    }

    for (;;) {
      stream.next_out = (char *)dst + outPos;
      stream.avail_out = dstCap - outPos;
      int result = BZ2_bzDecompress(&stream);
      outPos = dstCap - stream.avail_out;

      if (bz2_internal_failure) {
        BZ2_bzDecompressEnd(&stream);
        return -1;
      }
      if (result == BZ_STREAM_END) {
        inPos = srcLen - stream.avail_in;
        BZ2_bzDecompressEnd(&stream);
        break;
      }
      if (result != BZ_OK) {
        BZ2_bzDecompressEnd(&stream);
        return -1;
      }
      if (stream.avail_out == 0) {
        BZ2_bzDecompressEnd(&stream);
        return -2;
      }
    }
  }
  return (long long)outPos;
}
