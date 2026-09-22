# ImageForge

> **Universal Android Image Patcher** — analyze, patch, repack, verify and export Android
> images locally in your browser.

ImageForge is a local-first web tool. Image bytes never leave the device: parsing, patching,
repacking and hashing all run inside a Web Worker with WebAssembly assist.

    Android image -> Analyze -> Select patch method -> Resolve artifact -> Patch -> Verify -> Download

User guide: [docs/usage.md](docs/usage.md) — which image a method needs, what the checklist means,
and what to do when it goes wrong.

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

* **KernelSU (LKM) is the second provider.** It writes the ramdisk the way `ksud` does:
  `init` becomes `init.real`, a KernelSU init wrapper takes its place, and `kernelsu.ko` is
  added next to it. It targets `init_boot.img` (GKI 13+) or a `boot.img` that carries a
  ramdisk, refuses a ramdisk Magisk already patched, and requires the module to match the device
  KMI (read from the kernel banner when the image has one, otherwise selected). One loadable
  module per KMI is bundled and used by default; a module supplied by the user overrides it. The
  modules are built from KernelSU's kernel directory, which is GPL-2.0-only, so they are
  redistributed unmodified as separate programs with their own licence record
  (`THIRD_PARTY_LICENSES/kernelsu/`) rather than being linked into this AGPL-3.0-or-later project.
* **Magisk is the third provider.** It replaces the ramdisk `init` with `magiskinit`, writes its
  payloads to `overlay.d/sbin`, keeps its configuration in `.backup/.magisk`, patches fstab entries
  the way `magiskboot` does, and keeps the stock init inside the ramdisk as `.backup/init.xz` so
  Magisk's app can restore the image by itself. Its payloads are bundled from the pinned release,
  which is GPL-3.0 throughout.
* **A KernelPatch core image can also be supplied by hand.** Picking the custom flavour lets you
  attach your own `kpimg`: it is checked for the KernelPatch magic before kptools runs, the plan
  pins the file name, and the result reports the digest and the version kptools read from it.
  Whatever manager that image was built to trust is the one the device needs.
* **A KernelSU or Magisk module supplied by the user overrides the bundled one**, and both are
  checked the same way (its `.modinfo` and the kernel version it was built for).
* **LZ4 is compressed by the reference implementation, not a reimplementation.** `lz4.wasm` is
  upstream liblz4 1.10.0 (BSD-2-Clause) pinned and digest verified, driven at HC level 12, the setting
  magiskboot uses; a stock device ramdisk comes back out byte for byte identical, which
  `tests/unit/lz4.test.ts` asserts against the real image.
* **APatch patches arm64 kernels in uncompressed, gzip, LZ4 or xz containers.** The kernel is
  expanded, patched and written back into the same container (LZ4 frames with dependent
  blocks included). LZMA, BZip2 and Zstandard kernels are refused with a structured
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
* **Vendor boot images are supported by the ramdisk providers.** The platform ramdisk fragment is
  replaced and the image is repacked with its original layout: the dtb, the ramdisk table and the
  bootconfig stay where they were.

* **The result page ends with a checklist, not just a download button.** It repeats what the run
  recorded — the target partition, the manager app the image needs, what the dropped AVB signature
  means, what changed, the plan id — so the consequences of writing the image to a device are
  visible before you do it. **Export diagnostics** writes the same facts as JSON (no image bytes, no
  secret) for a bug report.
* **The interface speaks English, Simplified Chinese, Traditional Chinese and Japanese.** The
  language picker is in the header and in Settings. Patch records are deliberately *not* translated:
  a plan pins provider, release, artifact and configuration, and its id is a hash over them, so the
  same run has to produce the same plan whatever language the interface is in. Verdicts the
  interface words itself (compatibility reasons and warnings, verification checks) travel as stable
  codes and are translated where they are shown.

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
    pnpm wasm:build:lz4      # rebuild public/wasm/lz4.wasm from the pinned liblz4 release

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
  the plan. A module is checked before it is embedded (relocatable aarch64 ELF with an
  allocated `.kpm.info` section) and its declared name, version and licence are reported in
  the result. Third-party modules are never bundled: they are the user's files and their
  licences are the user's responsibility.

## Architecture

Full details in [docs/architecture.md](docs/architecture.md), user-facing steps in
[docs/usage.md](docs/usage.md).

    UI            React + TypeScript + Tailwind design tokens
    Application   Zustand store, worker client, routing
    Patch Engine  planner -> resolver -> executor -> verifier
    Compatibility image metadata -> provider candidates
    Artifacts     releases, artifacts, digests, architectures
    Providers     one pipeline per patch method, imported when a run needs it
    Image Engine  parse / extract / transform / repack / verify
    Ramdisk       CPIO newc read and write inside the original container
    Worker        Comlink RPC with progress events
    WASM          CRC32, LZ4 block coding and xz (LZMA2) coding

Hard rules: providers never parse boot images, the UI never decides compatibility, versions
are never hardcoded in the UI, heavy work never runs on the main thread, and nothing a page does
not need is loaded (describing a provider is data, running one is an on-demand import).

The ramdisk layer is lossless by construction: an untouched ramdisk serialises back to the exact
bytes it was parsed from, including entry padding, the trailer fields and any trailing padding,
and a real device `init_boot` image is used to enforce that
(`tests/integration/ramdisk.test.ts`).

## Project layout

    src/core/          image engine, patch engine, artifacts, compatibility, errors
    src/workers/       worker protocol, session, worker entry, Comlink client
    src/wasm/          ABI, TypeScript fallback, module loader, WASI tool runner
    third_party/       sources added around bundled upstream artifacts (not upstream code)
    src/components/    design system and shared application components
    src/routes/        Home, Analyze, Patch, Processing, Result, Settings
    src/stores/        Zustand stores (workflow + theme + language)
    src/i18n/          message catalogues (en, zh-Hans, zh-Hant, ja) and engine prose tables
    crates/            Rust crate compiled to WebAssembly
    tests/             unit, integration, worker, wasm and UI tests
    THIRD_PARTY_LICENSES/  upstream license texts and integration policy

## Image Engine coverage

| Feature | Support |
| --- | --- |
| boot image header v0 / v1 / v2 / v3 / v4 | parse, extract, repack, verify |
| `init_boot` classification (v4, no kernel) | yes |
| vendor boot header v3 / v4 | parse, extract and repack (the platform ramdisk fragment is replaced; the dtb, table and bootconfig are preserved) |
| Kernel architecture detection | arm64, arm (zImage), x86_64 (bzImage) heuristics |
| Compression detection | gzip, LZ4 (legacy and frame), XZ, LZMA, BZip2, Zstandard, CPIO |
| Compression expansion | gzip, LZ4 legacy and LZ4 frame (including dependent blocks), xz |
| Compression re-encoding | gzip and LZ4 (the **reference liblz4 1.10.0 codec** compiled to WebAssembly at HC level 12, the same revision and setting magiskboot uses, so a device ramdisk re-encodes to the bytes the stock image shipped) and xz (magiskboot's settings: preset 6, CRC32) |
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
