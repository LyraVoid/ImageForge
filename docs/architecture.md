# Architecture

ImageForge is layered so that the UI never touches binary parsing and a patch provider
never parses a raw `boot.img` itself.

## Layers

    UI / UX Layer            React components, routes, design system
            |
    Application Layer        Zustand store, worker client, navigation
            |
    Patch Engine             Planner -> Resolver -> Executor -> Verifier
            |
    Compatibility Engine     image metadata -> provider candidates
            |
    Artifact Registry        releases, artifacts, digests, architectures
            |
    Patch Providers          one implementation per patch method
            |
    Image Engine             Parser / Extractor / Transformer / Repacker / Verifier
            |
    Web Worker               task execution, Comlink RPC, progress events
            |
    WASM                     binary helpers and bundled upstream tools

## Tools

The site is a set of tools, and the patcher is one of them (`src/app/tools.ts` holds the list as
data: id, path, title and description keys, status, and whether the tool is a flow). Consequences:

* **The workflow steps belong to the patcher.** `isPatchFlow` decides whether the header and the
  mobile bar show the step indicator, so a single-page tool is not squeezed into a five step shape.
* **The tools page is the landing page, and the patcher is its primary card**, with the dropzone
  already on it: the most common task must not need a click to start. Single tools (extract,
  unpack, logo, inspect) are cards with a status badge; a planned tool is rendered but disabled.
* **The patcher's routes are namespaced** (`/tools/patch/image|analyze|plan|run|result`). The paths
  it used before the tools page existed (`/analyze`, `/patch`, `/processing`, `/result`) stay
  valid as redirects, because they were the address of a working flow.
* **A tool is not a route convention, it is a declaration.** When a new tool needs to consume what
  another produced (an extracted partition image, for example) it will declare the artifact kinds it
  accepts and produces, and the UI will offer the tools that match the current selection — the way
  the compatibility engine already lists the providers that match an image.

## The workspace

A site with several tools needs a memory of what the user is holding, and the patcher's single
`File` is not it. The worker session owns a **workspace**: the sources the user opened, and the
artifacts tools derived from them.

* `src/core/workspace/detect.ts` classifies bytes by magic into a **container** (raw, zip, OTA
  payload, sparse, gzip, LZ4, xz, zstd, …) and a **content** (boot, init_boot, vendor_boot, ext4,
  erofs, f2fs, dtb, elf), then maps that to an **artifact kind**. Vendor boot logo containers are
  deliberately absent from that table: their magics are not verified here yet, so a logo image is
  reported as a blob instead of guessed at.
* `src/core/workspace/kinds.ts` is the vocabulary tools match on: package, partition-image,
  boot-container, filesystem, ramdisk, logo-container, report, blob.
* `src/core/workspace/graph.ts` keeps sources, artifacts and their lineage: an artifact records the
  source it belongs to, the artifact it was derived from, the tool and its parameters. Closing a
  source drops its whole lineage with it, because the bytes came from it.
* `src/core/workspace/matching.ts` answers which tools apply to a selection, in the same shape the
  compatibility engine uses for images: a verdict plus stable reason codes the interface words itself
  (`src/i18n/engine-keys.ts`).
* Bytes never leave the worker. The main thread holds metadata only, and `readArtifact(id, offset,
  length)` reads a range when something has to look inside a large image. The workspace shares the
  session with the patcher, so opening an image and then patching it does not copy it.

The entry point follows from that: opening a file puts it in the workspace, reports what it is, and
either continues into the patcher (a boot image) or names the tools that accept it — with a planned
tool shown, disabled, and saying why.

## Packages

Two container formats deliver an Android image, and `src/core/package/` reads both:

* **zip** (`zip.ts`): the end-of-central-directory record, the central directory and the local
  headers. Stored and deflated entries are supported and every entry's CRC32 is checked; zip64 is
  refused, because the sizes it moves into an extra field are the ones that decide where an entry's
  data is. Deflate is expanded with `DecompressionStream("deflate-raw")`.
* **OTA payload** (`payload.ts`): the `CrAU` header, the protobuf manifest and the blob area, with
  the field numbers taken from magiskboot's own `update_metadata.proto` and its reader
  (`native/src/boot/payload.rs`). The manifest is parsed by a hand written wire reader
  (`protobuf.ts`), so no protobuf runtime joins the bundle. Partitions are rebuilt from their
  operations in blob order; `REPLACE`, `REPLACE_XZ` and `ZERO`/`DISCARD` are implemented, every
  blob is verified against `data_sha256_hash` and the rebuilt partition against its
  `new_partition_info.hash`. A delta payload (`minor_version != 0`) is refused: it describes changes
  against an image this tool does not have.

What an entry *is* never comes from its name: extraction produces bytes, and `detectArtifact`
classifies them, which is why an `init_boot` pulled out of an OTA is offered to the patcher
immediately. The blobs stay in the worker throughout: extraction registers a workspace artifact, and
the patcher reads that artifact where it already is (`analyzeArtifact`).

## Hard rules

1. **Providers never parse boot images.** A provider receives the normalized object
   produced by the Image Engine (`ParsedImage` / `AndroidImage`). When an upstream tool
   has to touch a kernel image, the provider hands it the kernel section the Image Engine
   already extracted, and the Image Engine repacks the container afterwards.
2. **The React UI never decides compatibility.** Candidates come from the compatibility
   engine.
3. **Versions are never hardcoded in the UI.** They come from the artifact registry.
4. **Heavy work never runs on the main thread.** Parsing, patching, repacking and hashing
   run inside the Web Worker.
5. **The Mock Provider never pretends to be a real root solution.** It is labelled as a
   mock in the UI, in the produced metadata and inside the patched image.
6. **Bundled artifacts are digest verified before execution.** `loadVerifiedPayload`
   refuses bytes whose SHA-256 differs from the registry entry.

## Internationalization

The interface ships in English, Simplified Chinese, Traditional Chinese and Japanese. Each
language has one catalogue in `src/i18n/messages/`; the English one is the source of truth, its keys
are the `MessageKey` union, and the other catalogues are typed as `Messages`, so a language that
misses a message does not compile. The prose the engine produces is separate: `src/i18n/record/`
holds one table per language keyed by the English source string, gettext style, and is used for
display only.

Two kinds of string stay English on purpose, for the same reason: **a plan is the record of a run**.
A plan pins provider, release, artifact, architecture, target, header version and configuration, and
its id is a hash over exactly those fields, so changing the interface language must not change a
plan or its id. Engine prose that can end up in a plan (stage labels, provider notes) therefore
stays English in the plan, and the interface translates what it displays. Verdicts the interface has
to word itself are reported as stable codes with parameters instead of sentences: compatibility
reasons (`reasonDetails[].code`), compatibility warnings and verification checks (`checks[].id`)
are matched against the tables in `src/i18n/engine-keys.ts`, and a code without a message falls
back to the English sentence the engine sent rather than showing nothing.

`tests/unit/i18n.test.ts` checks the catalogues (key parity, no empty message, identical
placeholders, a language that is actually translated) and `tests/unit/i18n-coverage.test.ts`
checks coverage in both directions: every report label, provider sentence, stage label and progress
line the engine can produce has a translation in every language, and every translation is tied to
prose that still exists in `src/core`.

## KernelSU (LKM) provider

    init_boot.img (or a boot.img with a ramdisk)
      -> Image Engine extracts the ramdisk section
      -> decompress (LZ4 legacy / LZ4 frame / gzip / xz) -> CPIO newc
      -> checks: not already Magisk patched, module pinned by the plan, module declares name=kernelsu,
         module vermagic matches the kernel version implied by the KMI
      -> init -> init.real, add init (ksuinit, 0755), add kernelsu.ko (0755), optional ksu_config
      -> serialise CPIO in ksud's canonical layout -> recompress in the original container
      -> Image Engine repacks the image
      -> verification reads the produced ramdisk back and requires init and kernelsu.ko to be there

The KMI decides which module is loadable (GKI keeps the module ABI stable within one). It is read
from the kernel banner when the image carries a kernel, and has to be selected for `init_boot.img`,
which carries none; a selection that contradicts the banner is refused rather than trusted.

The archive is written in the layout ksud uses, through `canonicalizeCpio`: entries sorted by
name, one per name, inodes renumbered from 300000 and nothing after the trailer. That is what makes
the produced ramdisk section byte for byte the one KernelSU's own app writes, which the real-material
test asserts.

One module per KMI is bundled and used by default, and a module supplied by the user overrides it.
The modules come from KernelSU's `kernel/` directory, which is GPL-2.0-only, so they are
redistributed the way KernelSU itself redistributes them: as separate, unmodified programs under
their own licence, never linked into this AGPL-3.0-or-later project (`THIRD_PARTY_LICENSES/kernelsu/`).
Whichever module is used, the provider reads its `.modinfo` and checks the kernel version it was
built for against the KMI, and the result records its name, licence and vermagic.

## Magisk provider

    init_boot.img (or a boot.img with a ramdisk)
      -> Image Engine extracts the ramdisk section
      -> decompress (LZ4 legacy / LZ4 frame / gzip / xz) -> CPIO newc
      -> checks: not already Magisk or KernelSU patched
      -> fstab entries: the verity and encryption flag strings are removed exactly as magiskboot
         removes them, and verity_key is dropped when verity is not kept
      -> init -> magiskinit (0750), overlay.d/ and overlay.d/sbin (0750) with magisk.xz, stub.xz and
         init-ld.xz (0644), .backup/.magisk (000) with the configuration, the stock init as
         .backup/init.xz (0750) and the added paths as .backup/.rmlist (000)
      -> serialise CPIO -> recompress in the original container -> Image Engine repacks the image
      -> verification reads the produced ramdisk back and requires the payloads and the config

The three payloads are bundled **uncompressed** — exactly the files Magisk's own patcher feeds to
`magiskboot compress=xz` — and ImageForge compresses them at patch time with the same codec
(`lzma-rust2` 0.21.0, preset 6, CRC32) and the same declared dictionary as the official streams
(64 MiB, see `src/core/image/xz.ts`), so the produced streams are byte for byte the ones the app
writes. The stock init is compressed the same way.

Two further details decide whether the output matches the app rather than merely booting:

* **The archive layout.** Magisk's patcher writes its ramdisk through a `BTreeMap`
  (`native/src/boot/cpio.rs:269`, `Cpio::dump`), so the entries come out sorted by name, a repeated
  name collapses into one entry, inodes are renumbered from 300000 with `nlink` 1 and `mtime` 0, and
  nothing follows the trailer. `canonicalizeCpio` (`src/core/image/cpio.ts`) reproduces that, and the
  Magisk provider calls it before encoding. The ramdisk layer itself stays byte-exact for untouched
  archives: normalising is the provider's decision, taken because it is reproducing this patcher.
* **The container codec.** LZ4 blocks are compressed by upstream liblz4 (see the WASM table below).

`tests/integration/magisk.test.ts` verifies the whole ramdisk section against an image the official
app produced from the same source image: same length, same SHA-256, byte for byte.

## Ramdisk layer

Android ramdisks are CPIO `newc` archives, usually inside a gzip or LZ4 container:

    ramdisk section -> decompress (LZ4 legacy / LZ4 frame / gzip / xz) -> CPIO newc -> entries
                    -> edit entries -> serialise CPIO -> recompress in the same container

Everything a producer wrote is preserved, including the padding after a name, the padding after a
payload, the trailer entry fields (producers disagree about them) and any bytes after the trailer,
so `serializeCpio(parseCpio(bytes))` returns the original bytes. That is the acceptance criterion
enforced by `tests/integration/ramdisk.test.ts` against a real device `init_boot` image: any
provider that wants to touch a ramdisk builds on a layer that is already proven to be lossless.

Re-encoding a ramdisk uses our own compressor, so the container bytes differ from the original
even when the payload is unchanged (on a 2.7 MB LZ4 legacy ramdisk the output is about 12% larger).
The payload is identical, which is what a bootloader parses; shrinking that difference is a
possible later improvement.

## Image Engine

| Stage | Implementation |
| --- | --- |
| Parse | boot header v0-v4, vendor boot header v3-v4 |
| Extract | kernel, ramdisk, second, recovery_dtbo, dtb, bootconfig, signature, vendor ramdisk table |
| Analyze | kernel architecture heuristics, compression detection, OS version decoding |
| Transform | cmdline, name, kernel, ramdisk, dtb and bootconfig replacement |
| Repack | page aligned rebuild, `recovery_dtbo_offset` fixup, AVB signature drop policy |
| Verify | re-parse, bounds checks, per-section SHA-256, expectation matching |

Real images shaped two decisions:

* On v4 images an AVB vbmeta blob can follow the kernel while `signature_size` is 0. It is
  reported as a signature region, never as bootconfig, and it is dropped on repack.
* The kernel payload is handed to providers as raw section bytes together with its detected
  compression, so a provider can refuse an unsupported format instead of corrupting it.

Compression support: gzip is expanded through `DecompressionStream`; LZ4 legacy and LZ4 frame
payloads are expanded by the Rust WebAssembly codec, which keeps a 64 KiB window so frames with
dependent blocks decode correctly; xz goes through the same module, which holds an LZMA2 codec built
from the crate magiskboot uses.

LZ4 *compression* is not a reimplementation: `public/wasm/lz4.wasm` is upstream liblz4 1.10.0,
compiled from the pinned tarball by `scripts/build-lz4-wasm.sh` — the revision magiskboot links
(`lz4-sys 1.11.1+lz4-1.10.0` in Magisk v30.7) and the one the stock tools used. Blocks are
compressed at `LZ4HC_CLEVEL_MAX` (12), exactly what `magiskboot` passes, so a device ramdisk
re-encodes to the bytes the stock image shipped, byte for byte (`tests/unit/lz4.test.ts`). The hand
written encoder in the Rust module stays as the fallback for environments where the reference module
cannot be loaded; it produces valid but about 3% larger blocks. Level 12 is the slow setting: a
5 MB `init_boot` ramdisk takes about 0.4 s, while the 63 MB vendor ramdisk of a device image takes
about 13 s inside the patch worker (the same setting costs the official patchers the same work). LZMA, BZip2 and Zstandard are detected and
reported but cannot be expanded. "unknown" means no container magic matched, which is
what a plain arm64 `Image` looks like, so those payloads are passed through unchanged.

When a provider has to rewrite a compressed section, `describeCompression` captures the
container settings (block size, block and content checksums, content size, dictionary id)
and `compressSection` writes the payload back into the same container using our LZ4 block
compressor and XXH32. Without that step the bootloader would try to decompress an
uncompressed payload.

Vendor boot images are parsed and repacked: the platform ramdisk fragment is replaced and the
layout is recomputed by the parser's own rule (page aligned ramdisk, then dtb, table and bootconfig),
so every other section ends up where it started.

## Lazy loading

Describing a provider is data, running one is code, and the two travel separately:

* `src/core/patch/providers/descriptors.ts` holds the name, description, supported formats and
  status of every provider. The compatibility engine and the UI read only those, so listing the
  candidates never imports a patch pipeline.
* `src/core/patch/providers/registry.ts` imports an implementation with `import()` the first time
  that provider is actually used (`PROVIDER_LOADERS`). Every `PatchProvider` method is
  asynchronous, so a `LazyPatchProvider` can stand in for the real object: it reports the
  descriptor's name, forwards the first call and shares one import between concurrent callers. A
  failed import is not cached, so it can be retried.
* Constants a caller can legitimately need without running anything (plan configuration keys, entry
  names, the registered KernelPatch flavours, the Magisk config builder) live in `*-config.ts`
  next to the implementation, and the `src/core` barrel re-exports those instead of the classes.
* The inline worker session — the fallback used when `Worker` is unavailable — is imported on demand
  too, so a browser that has a Worker does not carry the Image Engine on the main thread.
* `package.json` declares the app side-effect free except for CSS, which lets the bundler drop the
  `src/core` re-exports a page never touches.
* Messages follow the same rule as providers. English (`messages/en.ts`) is bundled because it is
  the source of truth, the `MessageKey` union and the fallback; the other three languages — the
  interface catalogue and the engine prose table together — are imported when one is selected
  (`src/i18n/catalog.ts`). Until the selected catalogue arrives the interface keeps the language it
  already had, and `<html lang>` is set from the stored preference by the inline script in
  `index.html`, so the document never claims the wrong language.

Effect on the production build (measured, the numbers are machine specific): the first load went
from about 725 kB of JavaScript to about 470 kB. The Image Engine and the four providers left the
initial graph, and each provider became its own chunk — `apatch` 36 kB, `kernelsu` 12 kB,
`magisk` 10 kB, `mock` 5 kB — fetched when a plan or a patch first needs them. The shared UI chunk
went from 180 kB to 63 kB because the three non-English catalogues (about 18-24 kB each) became
chunks of their own. The worker builds its own copies of the provider chunks, which is how Vite
bundles a worker entry; the page only downloads what it imports.

The icon set was already on demand and needed no change: a lucide icon is its own module, and the
production source maps show exactly the thirty icons the app imports plus thirteen runtime helpers
(`createLucideIcon`, `Icon`, the name converters) — no unused icon is in any chunk.

## Patch providers

| Provider | Target | Mechanism |
| --- | --- | --- |
| `apatch` | `boot.img` only | KernelPatch core image injected into the kernel by the upstream kptools build in WebAssembly. Two core images are registered as artifacts (upstream and the Aster fork); each only trusts its own manager app, so the plan records `kernelPatchFlavor` and `requiredManager`. A run can also carry its own core image (`kernelPatchFlavor: custom`), which is checked for the KernelPatch magic before kptools sees it |
| `kernelsu` | `boot.img`, `init_boot.img`, `vendor_boot.img` | The ramdisk init becomes `init.real` and the ksuinit wrapper takes its place, with the KernelSU loadable module next to it. The module comes from the registry for the device KMI or from the run |
| `magisk` | `boot.img`, `init_boot.img`, `vendor_boot.img` | magiskinit replaces the ramdisk init, Magisk's payloads are written under `overlay.d/sbin`, its configuration goes to `.backup/.magisk`, and the stock init is kept as `.backup/init.xz` |
| `mock` | `boot.img`, `init_boot.img` | Rewrites the kernel cmdline and a bootconfig manifest |

All four are implemented; the two ramdisk providers are described above.

### APatch pipeline

    boot.img
      -> Image Engine parses and extracts the kernel section
      -> compatibility engine checks boot-only, arm64, kernel present, compression supported
      -> provider preflight runs "kptools -f" and requires CONFIG_KALLSYMS=y
      -> provider runs "kptools -p -i kernel -k kpimg -o kernel.patched" (no -S by default)
      -> optional: one "-M <module> -N <module> -T kpm" group per attached KernelPatch module
      -> provider confirms with "kptools -l -i kernel.patched" that patched=true and that the
         reported module count matches the attachments
      -> Image Engine repacks boot.img with the patched kernel and drops the AVB signature
      -> verifier re-parses the output and compares the kernel digest with the plan

Binary payloads such as KernelPatch modules travel as `PatchAttachment` entries on the run
context, never through the plan: the plan records only the file names, and the provider
refuses an attachment the plan does not pin.

The superkey is optional. When it is absent (the default, matching the APatch manager where
authentication is signature based) no `-S` argument is passed. When it is set, kptools stores
the SHA-256 of the key in the kernel's `root_superkey` field, which the kernel uses to
bootstrap the runtime superkey, so the key can be rotated later. The raw key never enters the
plan: it travels through `PatchRunContext.options`, the provider strips it from the plan
configuration, and only the mode is recorded.

Device images are usually whole-partition dumps, so the repacked image is compact by
default: partition padding and the AVB blob are not part of a boot image. When the plan
configuration asks for `preserveImageSize`, a provider passes `padTo: image.totalSize` to
`repackBootImage`, which zero pads the output and reports the padding as a warning. The
layout of the image itself is unchanged, and the AVB signature is dropped either way.

## WASM

| Module | Purpose |
| --- | --- |
| `public/wasm/imageforge.wasm` | Rust crate: CRC32, LZ4 block decoding (windowed) and LZ4 block compression, with an identical TypeScript fallback |
| `public/wasm/kptools.wasm` | Upstream KernelPatch kptools compiled to `wasm32-wasip1` |
| `public/wasm/lz4.wasm` | Upstream liblz4 1.10.0 (BSD-2-Clause) compiled to `wasm32-wasip1` in reactor mode: the reference block codec, so container bytes match the official patchers |

`kptools.wasm` is driven by `src/wasm/wasi-runner.ts` on top of
`@bjorn3/browser_wasi_shim`, which provides an in-memory file system. Upstream sources are
never modified: the build adds a separate compatibility file for two wasi-libc gaps and
copies `preset.h` into its own include directory. See
`third_party/kptools-wasm/README.md`.

Node's native `node:wasi` implementation crashes with SIGSEGV on this module's kallsyms
path, so tests and production both use the JavaScript shim.

## Reproducible patch plans

A plan pins provider, release, artifact id, artifact SHA-256, architecture, target image,
boot header version and configuration. The plan id is the leading 32 hex characters of the
SHA-256 over the canonicalised plan fields, excluding timestamps. The APatch provider
declares reproducibility only because the test suite checks that patching the same image
twice yields identical kernel bytes.

## Worker protocol

`PatchWorkerSession` implements the RPC surface and keeps the parsed image inside the
worker so image bytes are never resent:

    version()  -> string
    analyze(file: ArrayBuffer, name?) -> AnalyzeResponse
    plan({ providerId, options? })    -> PlanResponse
    patch({ providerId, options? }, onProgress) -> PatchResponse (bytes transferred back)
    cancel()   -> void
    reset()    -> void

When `Worker` is unavailable (tests, unsupported environments) the client falls back to an
inline session with the same interface.
