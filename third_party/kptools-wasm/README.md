# kptools as WebAssembly

`public/wasm/kptools.wasm` is the upstream KernelPatch `kptools` tool compiled to
`wasm32-wasip1`. ImageForge does not reimplement KernelPatch: the real upstream
implementation runs inside the patch worker behind a WASI shim.

    upstream project : https://github.com/bmax121/KernelPatch
    pinned revision  : 72a904c412754e25f54353c30f31f5c884ed0673 (version 0.13.8, kptools 0xd08)
    license          : GPL-2.0-or-later (see THIRD_PARTY_LICENSES/kernelpatch/)
    toolchain        : wasi-sdk 34.0 (clang 23.1.0), zlib 1.3.1 for wasm32-wasip1
    output           : 634242 bytes, sha256 bb53abeae8be16f4d2127af1b700d95ff8a75b38eea2829251c9f774c9b61c4c
    rebuild with     : pnpm wasm:build:kptools

## Upstream sources are unmodified

The upstream tree is never patched. Two build adjustments are kept outside of it:

1. `preset.h` is copied into `.wasm-build/include/`, which is exactly what upstream's
   `kernel/Makefile:138` does before building `tools/`. It must not be reached through
   `../kernel/include`, because that directory also contains kernel-side `stddef.h`
   and `stdint.h` which would shadow the libc headers.
2. `compat.c` supplies `mkstemp` and `system`, which wasi-libc does not provide.
   Both are only reachable from upstream's Windows-Subsystem-for-Android x86 gzip
   workaround; that path cannot run on arm64 Android images and cannot spawn processes
   inside WebAssembly, so `system` fails closed with `ENOSYS`.

## What ImageForge uses it for

Only the kernel-image modes are used, so the Android boot container stays the
responsibility of the Image Engine:

    -f -i kernel            read ikconfig flags (CONFIG_KALLSYMS precondition)
    -v -k kpimg             read the KernelPatch image version
    -p -i kernel -k kpimg   inject KernelPatch into the kernel image
    -l -i kernel            read back the applied patch information

## Host note

Node's native `node:wasi` implementation crashes with SIGSEGV on the kallsyms path of
this module. The pure JavaScript WASI shim used by the browser
(`@bjorn3/browser_wasi_shim`) runs it correctly, so tests and production share that
implementation.
