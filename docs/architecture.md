# Architecture

ImageForge is layered so that the UI never touches binary parsing and a patch provider
never touches raw `boot.img` bytes.

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
    WASM                     CPU heavy binary helpers (CRC32, LZ4 block decode)

## Hard rules

1. **Providers never parse boot images.** A provider receives the normalized object
   produced by the Image Engine (`ParsedImage` / `AndroidImage`).
2. **The React UI never decides compatibility.** Candidates come from the compatibility
   engine.
3. **Versions are never hardcoded in the UI.** They come from the artifact registry.
4. **Heavy work never runs on the main thread.** Parsing, patching, repacking and hashing
   run inside the Web Worker.
5. **The Mock Provider never pretends to be a real root solution.** It is labelled as a
   mock in the UI, in the produced metadata and inside the patched image.

## Image Engine

| Stage | Implementation |
| --- | --- |
| Parse | boot header v0-v4, vendor boot header v3-v4 |
| Extract | kernel, ramdisk, second, recovery_dtbo, dtb, bootconfig, signature, vendor ramdisk table |
| Analyze | kernel architecture heuristics, compression detection, OS version decoding |
| Transform | cmdline, name, kernel, ramdisk, dtb and bootconfig replacement |
| Repack | page aligned rebuild, `recovery_dtbo_offset` fixup, AVB signature drop policy |
| Verify | re-parse, bounds checks, per-section SHA-256, expectation matching |

Compression support in v0.1: gzip can be expanded (via `DecompressionStream`); LZ4, XZ,
LZMA, BZip2 and Zstandard are detected and reported but are copied through unchanged.

Vendor boot images are parsed read-only; repacking them is a structured error.

## Reproducible patch plans

A plan pins provider, release, artifact id, artifact SHA-256, architecture, target image,
boot header version and configuration. The plan id is the leading 32 hex characters of the
SHA-256 over the canonicalised plan fields, excluding timestamps, so identical inputs
produce identical plans and identical output bytes.

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
