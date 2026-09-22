# lz4

Status: **the reference LZ4 block codec is bundled as WebAssembly.**

ImageForge has to write boot image containers that a device bootloader accepts, and it has to
produce the same bytes the official patchers produce. For LZ4 that means the reference
implementation, not a reimplementation.

| Field | Value |
| --- | --- |
| Upstream project | https://github.com/lz4/lz4 |
| Pinned revision | tag `v1.10.0` |
| Upstream tarball | https://github.com/lz4/lz4/archive/refs/tags/v1.10.0.tar.gz |
| Tarball sha256 | `537512904744b35e232912055ccf8ec66d768639ff3abe5788d90d792ec5f48b` |
| Retrieved on | 2026-09-22 |
| License | BSD-2-Clause (LICENSE in this directory) |
| Local modifications | none: `lib/lz4.c` and `lib/lz4hc.c` are compiled as they are |
| Built artifact | `public/wasm/lz4.wasm`, 92917 bytes, sha256 `c855a8fd6e885b8edae3c8dfece0c213c891116cb61bb685216c3f8c1022b6b7` |
| Rebuild with | `pnpm wasm:build:lz4` |

## Why this version

Magisk v30.7 (the patcher this project reproduces) links `lz4-sys 1.11.1+lz4-1.10.0` and vendors
`https://github.com/lz4/lz4.git` as a submodule; its `native/src/boot/compress.rs:87` compresses
ramdisk blocks with `CompressionMode::HIGHCOMPRESSION(LZ4HC_CLEVEL_MAX)`, which is level 12. The
reference `lz4` command line tool with the same version and `-12 -l` produces byte for byte the
container a stock device image ships, which is how the pinned revision was confirmed
(`tests/unit/lz4.test.ts`).

Only the LZ4 *block* codec is used. The container framing (LZ4 legacy and LZ4 frame headers) stays
in `src/core/image/lz4.ts`, because a boot image writes a block stream, not a file format.
