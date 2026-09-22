# magisk

Status: **bundled**.

Magisk is GPL-3.0 throughout (unlike KernelSU, there is no per-directory split), so its binaries can
be redistributed with this AGPL-3.0-or-later project as separate, unmodified programs.

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/topjohnwu/Magisk |
| Pinned release | `v30.7` (released 2026-02-23) |
| Release asset | `Magisk-v30.7.apk`, 11613864 bytes, sha256 `e0d32d2123532860f97123d927b1bb86c4e08e6fd8a48bfc6b5bee0afae9ebd5` |
| Licence | GPL-3.0, see LICENSE in this directory |
| Retrieved on | 2026-09-22 |
| Local modifications | none |

## What is bundled, and where each file comes from

| APK entry | Bundled as | Digest (sha256) | Written into the ramdisk as | Mode |
| --- | --- | --- | --- | --- |
| `lib/arm64-v8a/libmagiskinit.so` | `public/artifacts/magisk/magiskinit` | `383670a7…6b468` | `init` | 0750 |
| `lib/arm64-v8a/libmagisk.so` | `public/artifacts/magisk/magisk` | `2d841901…e694e` | `overlay.d/sbin/magisk.xz` | 0644 |
| `assets/stub.apk` | `public/artifacts/magisk/stub` | `f0230e08…81eb0` | `overlay.d/sbin/stub.xz` | 0644 |
| `lib/arm64-v8a/libinit-ld.so` | `public/artifacts/magisk/init-ld` | `c71e6978…417f0` | `overlay.d/sbin/init-ld.xz` | 0644 |

Exact digests are in `src/core/artifacts/catalog.ts`, release `v30.7` of provider `magisk`. Only the
arm64 payloads are bundled, because every provider here targets arm64.

To reproduce: unzip the four APK entries listed above and rename them to `magiskinit`, `magisk`,
`stub` and `init-ld` (the APK's `assets/stub.apk`).

## The payloads are bundled uncompressed, on purpose

They are exactly the files Magisk's own patcher feeds to `magiskboot compress=xz`
(`scripts/boot_patch.sh:176`), and ImageForge compresses them at patch time with the same codec and
settings, so the streams it writes are the streams the official patcher writes:

* the codec is `lzma-rust2` 0.21.0, the crate magiskboot links (`native/src/boot/Cargo.toml:38`),
  at preset 6 with a CRC32 check (`native/src/boot/compress.rs:228`);
* the dictionary the stream *declares* is the one the official streams carry, 64 MiB — `xz --list
  --verbose --verbose` on the `overlay.d/sbin/*.xz` and `.backup/init.xz` of a device image reports
  `--lzma2=dict=64MiB`. The property byte only tells a decoder how much window to reserve, and the
  data is identical because nothing in these payloads lies further back than their own length, so
  the header is reproduced without allocating a 64 MiB match finder
  (`src/core/image/xz.ts`).

`tests/integration/magisk.test.ts` checks the result against an image the official app produced for
the same source image: the ramdisk section matches byte for byte.

## Note on restoring

Magisk's own uninstall relies on the original boot image and the ramdisk backup that its app keeps in
its private directory; neither is inside the patched image. Keep a stock copy of every partition you
patch, and note that ImageForge reports which patch programs an image already contains when it
analyses one.
