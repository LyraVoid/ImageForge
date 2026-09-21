# ImageForge

> **Universal Android Image Patcher** — analyze, patch, repack, verify and export Android
> images locally in your browser.

ImageForge is a local-first web tool. Image bytes never leave the device: parsing, patching,
repacking and hashing all run inside a Web Worker with WebAssembly assist.

    Android image -> Analyze -> Select patch method -> Resolve artifact -> Patch -> Verify -> Download

ImageForge does **not** flash devices, does not talk to fastboot or ADB, and never uploads
an image to a server.

## Status (v0.1)

Two providers are implemented and self-verifying:

* **APatch** is the first real provider. It injects the KernelPatch core image into the
  kernel inside `boot.img` using the **upstream kptools compiled to WebAssembly**, so the
  actual KernelPatch implementation runs in the browser rather than a reimplementation of
  it. Verified against a real GKI android13-5.10 boot image.
* **The Mock Provider** rewrites the kernel cmdline and a bootconfig manifest so the
  pipeline can be exercised without touching root. It never pretends to be a root solution.

Deliberately honest limits:

* **Magisk and KernelSU are declared but not implemented.** They are `planned` in the
  registry; both need CPIO read/write and the full compression matrix first, and their
  upstream sources and licenses must be read from the current revision before implementing.
* **APatch patches arm64 kernels in uncompressed, gzip or LZ4 containers.** The kernel is
  expanded, patched and written back into the same container (LZ4 frames with dependent
  blocks included). XZ, LZMA, BZip2 and Zstandard kernels are refused with a structured
  error instead of being patched wrongly. It also requires `CONFIG_KALLSYMS=y`, which is
  verified before the patch runs.
* **The superkey is optional and unset by default**, matching the manager default where
  authentication is signature based. The patch page can set one, in which case only its
  SHA-256 is embedded in the kernel (`root_superkey`) and the key itself is never written
  into the plan, the metadata or the produced image.
* **The AVB signature is dropped** on repack, so verified boot fails unless the produced
  image is re-signed or verification is disabled.
* **Remote artifact downloads are not implemented.** Only bundled artifacts (digest
  verified against the registry) and the built-in mock artifact can be resolved.
* **Vendor boot images are read-only** in this build.

## Quick start

    pnpm install
    pnpm dev          # development server
    pnpm build        # tsc -b && vite build (static output in dist/)
    pnpm preview      # serve the production build
    pnpm test         # unit, integration, worker and wasm tests
    pnpm typecheck    # project wide type check
    pnpm lint         # eslint
    pnpm wasm:build          # rebuild public/wasm/imageforge.wasm from the Rust crate
    pnpm wasm:build:kptools  # rebuild public/wasm/kptools.wasm from the pinned KernelPatch revision

Requirements: Node 20+, pnpm 9+. Rebuilding the Rust module needs a Rust toolchain with
the `wasm32-unknown-unknown` target; rebuilding kptools downloads wasi-sdk, zlib and the
pinned KernelPatch revision and needs no Rust. Both compiled modules are committed, so
neither toolchain is required for app development.

## APatch provider

    boot.img -> Image Engine extracts the kernel -> kptools.wasm injects kpimg
             -> Image Engine repacks boot.img -> verification

* Targets `boot.img` only: APatch patches the kernel, and `init_boot.img` carries no kernel.
* The kernel is expanded before patching and re-compressed into the original container, so
  the bootloader still finds the compression format it expects.
* Preflight runs `kptools -f` and refuses the image unless the kernel reports
  `CONFIG_KALLSYMS=y`; it also warns when `CONFIG_KALLSYMS_ALL` is disabled.
* **Two KernelPatch core images are registered** because each build only trusts its own
  manager app: the official upstream build (`me.bmax.apatch` manager, KernelPatch 0.13.3)
  and the Aster fork build (`me.yuki.aster` manager, KernelPatch 0.13.8, built from
  `LyraVoid/KernelPatch-Aster`). The patch page selects the flavour and names the manager
  that the produced image requires.
* Bundles three GPL artifacts, all digest verified before use:
  `public/wasm/kptools.wasm` (KernelPatch, GPL-2.0-or-later),
  `public/artifacts/apatch/kpimg` (APatch release 11224, GPL-3.0-or-later) and
  `public/artifacts/apatch/kpimg-aster.bin` (Aster fork `0ff4ae2`, GPL-2.0-or-later).
  See `THIRD_PARTY_LICENSES/` and `third_party/kptools-wasm/README.md`.
* Patching the same image twice produces identical kernel bytes; the test suite enforces it.
* The output is a compact boot image by default. The patch page can zero pad it back to the
  original image size for tools that expect a partition sized file; the AVB signature is
  dropped either way.
* **KernelPatch modules (KPM) can be embedded optionally.** The patch page attaches `.kpm`
  files; the plan pins their names and the run carries their bytes, so nothing binary enters
  the plan. Embedding and the reported module list are verified through `kptools -l`.

## Architecture

Full details in [docs/architecture.md](docs/architecture.md).

    UI            React + TypeScript + Tailwind design tokens
    Application   Zustand store, worker client, routing
    Patch Engine  planner -> resolver -> executor -> verifier
    Compatibility image metadata -> provider candidates
    Artifacts     releases, artifacts, digests, architectures
    Providers     one pipeline per patch method
    Image Engine  parse / extract / transform / repack / verify
    Worker        Comlink RPC with progress events
    WASM          CRC32 and LZ4 block decoding

Hard rules: providers never parse boot images, the UI never decides compatibility, versions
are never hardcoded in the UI, and heavy work never runs on the main thread.

## Project layout

    src/core/          image engine, patch engine, artifacts, compatibility, errors
    src/workers/       worker protocol, session, worker entry, Comlink client
    src/wasm/          ABI, TypeScript fallback, module loader, WASI tool runner
    third_party/       sources added around bundled upstream artifacts (not upstream code)
    src/components/    design system and shared application components
    src/routes/        Home, Analyze, Patch, Processing, Result, Settings
    src/stores/        Zustand stores (workflow + theme)
    crates/            Rust crate compiled to WebAssembly
    tests/             unit, integration, worker, wasm and UI tests
    THIRD_PARTY_LICENSES/  upstream license texts and integration policy

## Image Engine coverage

| Feature | Support |
| --- | --- |
| boot image header v0 / v1 / v2 / v3 / v4 | parse, extract, repack, verify |
| `init_boot` classification (v4, no kernel) | yes |
| vendor boot header v3 / v4 | parse and extract (read-only) |
| Kernel architecture detection | arm64, arm (zImage), x86_64 (bzImage) heuristics |
| Compression detection | gzip, LZ4 (legacy and frame), XZ, LZMA, BZip2, Zstandard, CPIO |
| Compression expansion | gzip, LZ4 legacy and LZ4 frame (including dependent blocks) |
| Compression re-encoding | gzip and LZ4, reproducing the original block size, checksums, content size and dictionary id |
| AVB signature | detected, dropped on repack with a warning |

## Verification model

Every produced image is verified before it is offered for download:

* the output is re-parsed (magic, header version, section bounds, page alignment);
* the ramdisk SHA-256 is compared with the patch plan when the plan records one;
* the cmdline and bootconfig markers required by the plan must be present;
* the produced bytes are hashed and compared with the digest reported by the provider;
* the resolved artifact digest is re-checked against the registry.

## Security

* Images are validated before parsing (magic, header version, size limits, section bounds).
* No `eval`, no `new Function`, no execution of user supplied scripts.
* The WASM module is a local build artifact with no third-party dependencies.
* The wasm loader degrades to a TypeScript implementation instead of failing the app.

## License

ImageForge is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Third-party code keeps its own license and is never re-licensed. See
[THIRD_PARTY_LICENSES/](THIRD_PARTY_LICENSES/README.md).
