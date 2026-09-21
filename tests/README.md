# Tests

    tests/
    ├── fixtures/     programmatic Android image builders
    ├── unit/         image engine, registry, compatibility, compression
    ├── integration/  full patch pipeline and UI smoke tests
    ├── worker/       Comlink worker session API
    └── wasm/         TypeScript fallback and compiled wasm parity

Run everything with `pnpm test`.

## Fixtures

Boot images are **built programmatically** in `tests/fixtures/bootimg.ts` instead of being
committed as binary blobs. That keeps the repository free of opaque binaries with unclear
provenance (and of any licensing question around redistributed vendor images), while still
covering every layout:

* boot header v0, v1, v2, v3, v4 (page aligned sections, recovery_dtbo, dtb, signature);
* `init_boot` (v4 header, no kernel);
* vendor boot header v3 and v4 including the vendor ramdisk table;
* gzip compressed ramdisks, deliberately non-gzip payloads and corrupted inputs.

The builders are written directly against the byte layout, so the parser is not tested
against its own encoder.

## Tests that need a real image

Kernel patching cannot be validated with synthetic kernels: KernelPatch needs real
kallsyms data. Those tests are skipped unless a real image is available, either at
`.research/images/gki-a13-5.10/boot-5.10.img` or pointed to by `IMAGEFORGE_TEST_IMAGE`:

    IMAGEFORGE_TEST_IMAGE=/path/to/boot.img pnpm test

They exercise the full APatch pipeline, including the WebAssembly KernelPatch run, and are
skipped (not silently passed) when no image is present. Bundled artifacts
(`public/wasm/kptools.wasm`, `public/artifacts/apatch/kpimg`) are always checked against
the digests recorded in the artifact registry.

## Tests that need a real ramdisk

`tests/integration/ramdisk.test.ts` checks the acceptance criterion of the ramdisk layer against a
real `init_boot` image: an untouched ramdisk must round trip byte for byte, and an edited one must
still decode back with the untouched entries intact. It runs when such an image is supplied through
`IMAGEFORGE_INIT_BOOT` (default `.research/aster-validation/init_boot.img`), otherwise it reports
itself as skipped.

## Tests that need a real KernelPatch module

`tests/integration/apatch-real-kpm.test.ts` embeds a real third-party module and checks that
kptools reports its declared identity back. Such modules are usually proprietary, so none is
bundled: the test runs when one is supplied through `IMAGEFORGE_TEST_KPM`, or found through
`IMAGEFORGE_KPM_DIR` (default `.research/kpm`). Without one it reports itself as skipped.

## KernelPatch module fixtures

`tests/fixtures/kernelpatch/` holds two small modules from the KernelPatch-Aster `0.13.8`
release (`demo-hello.kpm`, `demo-inlinehook.kpm`, GPL-2.0-or-later) so the embedding path is
covered with a real module; see THIRD_PARTY_LICENSES/apatch/ for the record.

`tests/fixtures/kpm.ts` builds a minimal KernelPatch module: a relocatable aarch64 ELF with a
`.kpm.info` section, which is exactly what `kptools` checks before embedding one
(`tools/kpm.c:get_kpm_info`). The embedding path is therefore covered without shipping a
compiled kernel module.

## Tests that need a flashed device dump

`tests/integration/apatch-aster-reproduction.test.ts` is the strongest check in the suite:
it patches a stock boot image with the bundled Aster KernelPatch core image and requires the
result to be **byte identical** to a boot partition dumped from a device flashed with that
build. It runs when both files are supplied:

    IMAGEFORGE_STOCK_IMAGE=/path/to/stock-boot.img \
    IMAGEFORGE_ASTER_DUMP=/path/to/flashed-boot.img pnpm test

Without them the file reports itself as skipped.

## Tests that need the reference lz4 tool

`tests/unit/lz4.test.ts` cross checks our codec against the reference `lz4` binary whenever
it is installed: frames, legacy frames and dependent-block frames (`-BD`) are decoded, and
our own frames are handed back to `lz4 -d`. The inner round trips always run, so the codec
is covered even without the tool.

## Environment

The default Vitest environment is `node`; the UI smoke test opts into jsdom with a
`// @vitest-environment jsdom` docblock. `tests/setup.ts` provides WebCrypto,
`CompressionStream` and `DecompressionStream` when the runtime does not expose them.
