# ImageForge

> **Universal Android Image Patcher** — analyze, patch, repack, verify and export Android
> images locally in your browser.

ImageForge is a local-first web tool. Image bytes never leave the device: parsing, patching,
repacking and hashing all run inside a Web Worker with WebAssembly assist.

    Android image -> Analyze -> Select patch method -> Resolve artifact -> Patch -> Verify -> Download

User guide: [docs/usage.md](docs/usage.md) — which image a method needs, what the checklist means,
and what to do when it goes wrong.

## Tools

The start page is a set of tools; the patcher is the first one, and the only one with steps.

| Tool | State |
| --- | --- |
| **Patch an image** — analyze, plan, patch, verify, download (`/tools/patch/*`) | available |
| **Extract from a package** — OTA `payload.bin` and vendor archives (`/tools/extract`) | available |
| **Unpack partitions** — sparse images, `super.img` logical partitions, erofs and ext4 browsing (`/tools/unpack`) | available |
| **Boot logo (first screen)** — read, view and replace splash and MediaTek logo images (`/tools/logo`) | available |
| **Inspect an image** — read-only look at anything you open: what it is, its report and digests (`/tools/inspect`) | available |

Adding one is a data change (`src/app/tools.ts`) plus its own route; the tools page, the header and
the routing table all render from that list. A tool also declares the artifact kinds it accepts and
produces, and the page offers the tools that match whatever the user opened.

**Packages are read in the browser too.** The extract tool opens a vendor zip archive (central
directory, stored and deflated entries, CRC32 checked) or an OTA `payload.bin` (the CrAU header, the
protobuf manifest and its partition streams: REPLACE, REPLACE_XZ, REPLACE_BZ, ZERO) and pulls a
partition out of it. Every blob is checked against the digest the manifest declares, and whatever
comes out is detected like any other file — so an `init_boot` extracted from an OTA goes straight
into the patcher.

It is built for the real thing: an **8 GiB zip64 OTA** is opened as a file handle and read in ranges,
never loaded, and a payload stored inside it is descended into rather than extracted
(`payload.bin::init_boot`). Entries that cannot be handed over honestly — a deflated entry that only
exists compressed, an entry past the in-memory limit, a partition stored as a delta that needs the
source image — are refused by name instead of guessed at.

**Big partitions stream instead of being held.** A partition larger than 256 MiB is produced operation
by operation into a `Blob` (which browsers keep on disk) rather than a single buffer, so a 3 GiB
`my_stock` can be extracted and downloaded — it used to be impossible, since one `Uint8Array` of that
size cannot exist in a browser. The page marks such an artifact as blob-backed.

**Packing is covered too.** An extracted partition can be rewritten as an Android sparse image from
the unpack page, and the chunking matches AOSP's own writer: the image it produces is byte for byte
what img2simg writes for the same input, verified against the real tool and against a 15 MB partition
taken from an OTA. The result streams into a blob, so a 3 GiB partition can be packed without being
held in memory.

**The boot screen is editable too.** Two containers are read and written: OPPO / Realme / OnePlus
splash.img (Qualcomm) and MediaTek's logo.img (Xiaomi and other MTK devices). A splash image's frames
are named; a MediaTek one has no frame names and does not record its screen size, so the page asks for
it and offers the sizes its biggest block could be, with the preview settling which one is right. Both
containers are repacked the same way — frames you did not touch keep their exact bytes, rebuilding
without changes reproduces the file byte for byte, and the page says which check it ran.

A splash image's frames are listed with thumbnails, any frame
can be replaced with a picture of your own (kept as it is, cropped or stretched to the frame, or a
size you name), and the image is packed again: frames you did not touch keep their exact bytes, and
repacking without changes reproduces the partition byte for byte — which the page checks and says so
— and the frames can be exported as one archive with a manifest. The result is a download, never a
flash.

**And they are read where they lie.** A partition inside an OTA payload is a range source: browsing
its filesystem decodes only the operations that cover the bytes being looked at, so a 759 MB `system`
image can be listed and a file taken out of it without ever existing as one buffer — the test that
does exactly that compares the result with the digest the device reports for the same file.

**Partitions come out of their wrappers too.** The unpack tool turns a sparse image into the image
it stands for (checking the header's checksum), lists the logical partitions of a `super.img` with
their extents and extracts one without copying the image, and walks an **erofs** filesystem — the
format Android 16 system images use — listing directories, descending, and reading files out of it,
including the ones stored as LZ4 compressed clusters (which is most of an Android system image).
Files in the packed inode, interlaced or inline pclusters and non-LZ4 compression are refused by
name. **ext4** images are read too: superblock, extent tree (any depth) and directories, so a
`vendor_dlkm` or any other ext4 partition can be walked and its files taken out. Both filesystems
are verified against the device itself: the tests reproduce `sha256sum` digests taken from the
running system, and they match byte for byte.

**The workspace knows what you dropped.** Every file is classified by its magic into a container
(zip, OTA payload, sparse image, a compressed stream …) and a content (boot image, ext4, erofs, device
tree, ELF …), and the page then says what it is and which tool takes it. Bytes stay in the worker:
the interface only ever holds metadata.

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
  The archive layout is ksud's, so the produced ramdisk is **byte for byte the one the KernelSU app
  writes** for the same image.
* **Magisk is the third provider.** It replaces the ramdisk `init` with `magiskinit`, writes its
  payloads to `overlay.d/sbin`, keeps its configuration in `.backup/.magisk`, patches fstab entries
  the way `magiskboot` does, and keeps the stock init inside the ramdisk as `.backup/init.xz` so
  Magisk's app can restore the image by itself. Its payloads are bundled uncompressed from the
  pinned release (GPL-3.0 throughout) and compressed at patch time with magiskboot's codec, settings
  and declared dictionary; together with magiskboot's archive layout that makes the produced ramdisk
  **byte for byte the one the official app writes**, which the real-material test asserts.
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
