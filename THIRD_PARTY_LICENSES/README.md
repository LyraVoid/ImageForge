# Third-party licenses

This directory is reserved for the verbatim license texts and copyright notices of every
third-party component that ImageForge links, embeds, bundles or downloads at runtime.

## Directory layout

    THIRD_PARTY_LICENSES/
    ├── magisk/
    ├── weavemask/
    ├── kernelsu/
    ├── apatch/
    ├── kernelpatch/
    ├── lz4/
    ├── bzip2/
    └── rust-crates/

Each subdirectory must contain, for the exact revision that ImageForge integrates:

1. the upstream `LICENSE` file, unmodified;
2. the upstream copyright notice(s);
3. a `README.md` recording the upstream repository URL, the pinned revision (commit or
   tag), the date the text was copied, and any local modifications made to that code.

## Rules

* Never re-license third-party code.
* Never merge code that is under different licenses into a single license file.
* Never copy an artifact into this repository before its upstream license has been read.
* The license of every upstream project must be taken from the current upstream revision;
  do not guess it and do not rely on second-hand summaries.

## Current status

Bundled third-party components, each with its own directory, pinned revision and digest:

| Component | Kind | License |
| --- | --- | --- |
| KernelPatch `kptools` (`public/wasm/kptools.wasm`) | bundled tool | GPL-2.0-or-later |
| KernelPatch core images (`public/artifacts/apatch/*`) | bundled artifact | GPL-2.0-or-later / GPL-3.0-or-later |
| KernelSU `ksuinit` and the loadable modules | separate, unmodified programs | GPL-3.0-or-later / GPL-2.0-only |
| Magisk payloads (`public/artifacts/magisk/*`) | bundled artifact | GPL-3.0 |
| WeaveMask payloads (`public/artifacts/weavemask/*`) | bundled artifact | GPL-3.0 |
| lz4 (`public/wasm/lz4.wasm`) | bundled codec | BSD-2-Clause |
| bzip2 (`public/wasm/bzip2.wasm`) | bundled codec | BSD-like |
| Rust crates linked into `public/wasm/imageforge.wasm` | linked into our own module | Apache-2.0 / MIT |

Two files hold the digests that are verified before any of these payloads is used. Provider
artifacts are in `src/core/artifacts/catalog.ts` (including `kptools.wasm`, which a provider
compiles), and the codecs the WebAssembly layer fetches itself are in `src/wasm/assets.ts`. Each
record names the register in this directory that documents the same path, and the tests keep all
three in step: `tests/unit/third-party-registry.test.ts` refuses a bundled artifact with no record
here, and `tests/unit/wasm-assets.test.ts` hashes `public/wasm/` so a rebuilt module cannot leave a
stale digest behind.
