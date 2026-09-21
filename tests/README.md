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

## Environment

The default Vitest environment is `node`; the UI smoke test opts into jsdom with a
`// @vitest-environment jsdom` docblock. `tests/setup.ts` provides WebCrypto,
`CompressionStream` and `DecompressionStream` when the runtime does not expose them.
