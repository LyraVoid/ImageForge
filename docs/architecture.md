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

Compression support: gzip is expanded through `DecompressionStream`; LZ4 legacy and LZ4
frame payloads are expanded by the WebAssembly codec, which also keeps a 64 KiB window so
frames with dependent blocks decode correctly. XZ, LZMA, BZip2 and Zstandard are detected
and reported but cannot be expanded. "unknown" means no container magic matched, which is
what a plain arm64 `Image` looks like, so those payloads are passed through unchanged.

When a provider has to rewrite a compressed section, `describeCompression` captures the
container settings (block size, block and content checksums, content size, dictionary id)
and `compressSection` writes the payload back into the same container using our LZ4 block
compressor and XXH32. Without that step the bootloader would try to decompress an
uncompressed payload.

Vendor boot images are parsed read-only.

## Patch providers

| Provider | Target | Mechanism |
| --- | --- | --- |
| `apatch` | `boot.img` only | KernelPatch core image injected into the kernel by the upstream kptools build in WebAssembly. Two core images are registered as artifacts (upstream and the Aster fork); each only trusts its own manager app, so the plan records `kernelPatchFlavor` and `requiredManager` |
| `mock` | `boot.img`, `init_boot.img` | Rewrites the kernel cmdline and a bootconfig manifest |

Magisk and KernelSU are declared as `planned`. Both need CPIO read/write, the full
compression matrix and their own upstream artifact and license review before they can be
implemented.

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
