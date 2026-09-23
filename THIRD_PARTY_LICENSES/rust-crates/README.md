# Rust crates linked into our WebAssembly module

`public/wasm/imageforge.wasm` is built from `crates/imageforge-wasm` (`pnpm wasm:build`). The crates
below are compiled into that module, so their code is redistributed inside this project's own binary
artifact. Both are permissive and compatible with the AGPL-3.0-or-later license of this project; each
is pinned by version and by the checksum `crates/imageforge-wasm/Cargo.lock` records.

| Crate | Upstream | Version | Checksum (SHA-256 of the crate) | License | Used for |
|---|---|---|---|---|---|
| lzma-rust2 | https://github.com/hasenbanck/lzma-rust2/ | 0.21.0 | `fde178a3caf126c440fa15628147772d8ee590a39477d711353fbe2e58a73a5b` | Apache-2.0 | xz / LZMA2 streams: the crate magiskboot also links, at 0.16.2 there and 0.21.0 here. The streams it produces agree with the official patcher's byte for byte, which the real-material Magisk test asserts. |
| bzip2-rs | https://github.com/paolobarbolini/bzip2-rs | 0.1.2 | `beeb59e7e4c811ab37cc73680c798c7a5da77fc9989c62b09138e31ee740f735` | MIT/Apache-2.0 | bzip2 *decoding*: real OTA payloads store partitions as `REPLACE_BZ` blobs. Decode only, by design. |

Neither crate is patched: they are used exactly as published, and `cargo tree --manifest-path
crates/imageforge-wasm/Cargo.toml` lists the transitive set.

The module they end up in is `public/wasm/imageforge.wasm`, 181833 bytes, sha256
`0605b7ae822158da860108de44ced14cea5d3f775dc67d30c065ccfadce19b31` (`pnpm wasm:build`). Its digest is
pinned in `src/wasm/assets.ts`, which every loader verifies before instantiating the module.
