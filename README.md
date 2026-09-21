# ImageForge

> **Universal Android Image Patcher** — analyze, patch, repack, verify and export Android
> images locally in your browser.

ImageForge is a local-first web tool. Image bytes never leave the device: parsing, patching,
repacking and hashing all run inside a Web Worker with WebAssembly assist.

    Android image -> Analyze -> Select patch method -> Resolve artifact -> Patch -> Verify -> Download

ImageForge does **not** flash devices, does not talk to fastboot or ADB, and never uploads
an image to a server.

## Status (v0.1)

This is the phase-1 skeleton. It is complete and self-verifying, but it is deliberately
honest about what it is not:

* **The Mock Provider is the only implemented provider.** It rewrites the kernel cmdline
  and writes a bootconfig manifest so the whole pipeline can be exercised and verified end
  to end. It does not root a device and never pretends to be Magisk, KernelSU or APatch.
* **Magisk, KernelSU and APatch are declared but not implemented.** They appear in the
  registry as `planned` with the reason "Not implemented in this build", and their
  upstream sources, version models, artifact layouts and licenses must be read from the
  current upstream revision before they are implemented.
* **Remote artifact downloads are not implemented.** Only the built-in, digested mock
  artifact can be resolved.
* **Vendor boot images are read-only** in this build.

## Quick start

    pnpm install
    pnpm dev          # development server
    pnpm build        # tsc -b && vite build (static output in dist/)
    pnpm preview      # serve the production build
    pnpm test         # unit, integration, worker and wasm tests
    pnpm typecheck    # project wide type check
    pnpm lint         # eslint
    pnpm wasm:build   # rebuild public/wasm/imageforge.wasm from the Rust crate

Requirements: Node 20+, pnpm 9+. Building WASM additionally requires a Rust toolchain with
the `wasm32-unknown-unknown` target. The compiled module is committed, so a Rust toolchain
is optional for app development.

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
    src/wasm/          ABI, TypeScript fallback, module loader
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
| Compression expansion | gzip only |
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
