# lz4 as WebAssembly

`public/wasm/lz4.wasm` is upstream liblz4 compiled to `wasm32-wasip1` in reactor mode. ImageForge
does not reimplement LZ4 compression: the reference implementation runs in the browser, so the
container bytes match what magiskboot and the stock tools write.

    upstream project : https://github.com/lz4/lz4
    pinned revision  : tag v1.10.0 (tarball sha256 537512904744b35e232912055ccf8ec66d768639ff3abe5788d90d792ec5f48b)
    license          : BSD-2-Clause (see THIRD_PARTY_LICENSES/lz4/)
    toolchain        : wasi-sdk 34.0 (clang), -O3, wasm32-wasip1, reactor model
    output           : 92917 bytes, sha256 c855a8fd6e885b8edae3c8dfece0c213c891116cb61bb685216c3f8c1022b6b7
    rebuild with     : pnpm wasm:build:lz4

## Upstream sources are unmodified

The build compiles `lib/lz4.c` and `lib/lz4hc.c` straight out of the pinned tarball. Nothing is
patched and no compatibility file is needed: the reactor build lets wasi-libc provide `malloc`,
`free`, `memcpy` and `memset`, and the module turned out to have **no imports at all**, so it is
instantiated directly from JavaScript like the Rust codec.

## Exports

    _initialize            WASI reactor initialisation (called once by the loader)
    memory                 the module's linear memory
    malloc / free          the buffers the loader writes into and reads back
    LZ4_compress_HC        the reference single-call high compression entry point
    LZ4_compressBound      the output bound for a block
    LZ4_versionNumber      verified by the loader's status and by the tests (11000 = 1.10.0)

## What ImageForge uses it for

Only block compression. `src/core/image/lz4.ts` keeps the container framing (legacy and frame
headers, block sizes, checksums) and the decoder, which is the Rust module's. When this module
cannot be loaded, the hand written encoder in `crates/imageforge-wasm` is used instead; it produces
valid but slightly larger blocks, which the loader and the tests report.
