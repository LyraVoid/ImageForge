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

| APK entry | Bundled as | Written into the ramdisk as | Mode |
| --- | --- | --- | --- |
| `lib/arm64-v8a/libmagiskinit.so` | `public/artifacts/magisk/magiskinit` | `init` | 0750 |
| `lib/arm64-v8a/libmagisk.so` | `public/artifacts/magisk/magisk.xz` | `overlay.d/sbin/magisk.xz` | 0644 |
| `assets/stub.apk` | `public/artifacts/magisk/stub.xz` | `overlay.d/sbin/stub.xz` | 0644 |
| `lib/arm64-v8a/libinit-ld.so` | `public/artifacts/magisk/init-ld.xz` | `overlay.d/sbin/init-ld.xz` | 0644 |

Only the arm64 payloads are bundled, because every provider here targets arm64.

## Why the payloads are shipped compressed

Magisk's patcher compresses them itself, at patch time
(`scripts/boot_patch.sh`: `magiskboot compress=xz magisk magisk.xz`), and a browser cannot run
magiskboot. The streams here were produced ahead of time with the same settings magiskboot uses
(`native/src/boot/compress.rs:228`: `XzOptions::with_preset(6)` and `CheckType::Crc32`, which is
`xz --check=crc32 -6`), and each one was validated with the reference `xz` tool (`xz -t` and a
`xz -dc | cmp` round trip against the uncompressed input).

To reproduce: unzip the four APK entries listed above, rename them to `magiskinit`, `magisk`,
`stub.apk` and `init-ld`, then run `xz --check=crc32 -6 -c <file> > <file>.xz` for the last three
(`stub.apk` becomes `stub.xz`). Exact digests are in `src/core/artifacts/catalog.ts`, release
`v30.7` of provider `magisk`.

## Note on restoring

Magisk's own uninstall relies on the original boot image and the ramdisk backup that its app keeps in
its private directory; neither is inside the patched image. Keep a stock copy of every partition you
patch, and note that ImageForge reports which patch programs an image already contains when it
analyses one.
