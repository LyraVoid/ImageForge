# bzip2

`public/wasm/bzip2.wasm` is the **decompression** half of the reference bzip2, compiled to
WebAssembly by `scripts/build-bzip2-wasm.sh`.

| | |
|---|---|
| Upstream | https://sourceware.org/pub/bzip2/ (bzip2 1.0.8, the last upstream release); the same release is mirrored at https://github.com/libarchive/bzip2 |
| Tarball SHA-256 | `ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269` |
| Built module | `public/wasm/bzip2.wasm`, 73166 bytes, sha256 `d4645c6abdc34c59e30061f46a0490a3b51ca2d03b8cc474f6a99eedd4804196` (`pnpm wasm:build:bzip2`; the script finishes by printing this digest) |
| Compiled from | `bzlib.c`, `decompress.c`, `huffman.c`, `crctable.c`, `randtable.c` (upstream, unmodified) |
| Added by this project | `third_party/bzip2-wasm/bz2_shim.c`: the entry point, the concatenated stream loop the command line tool performs, and a `bz_internal_error` hook that records the failure instead of calling `exit(3)` (which would trap a WebAssembly instance). |
| Licence | BSD-like, see [LICENSE](LICENSE) |
| Why | OTA payloads carry partitions as `REPLACE_BZ` operations. The pure Rust decoder used first rejects a real stream from a CPH2723 full OTA that `bunzip2` reads without complaint, so the reference implementation decodes them: its output was checked against `bunzip2 -c` digest for digest. |
