# magiskube

Status: **bundled**.

MagisKube is a fork of Magisk, so it is GPL-3.0 throughout, exactly like the project it forks: the
upstream licence text applies unchanged (the file in this directory is byte identical to Magisk's,
sha256 `589ed823e9a84c56feb95ac58e7cf384626b9cbf4fda2a907bc36e103de1bad2`). Its payloads are
redistributed with this AGPL-3.0-or-later project as separate, unmodified programs.

| Field | Value |
| --- | --- |
| Repository | https://github.com/SunRayEx/Magisk-Metro ("The Magic Mask for Android", the releases are named MagisKube) |
| Fork of | https://github.com/topjohnwu/Magisk, on the v30.7 base: `app/gradle.properties` sets `magisk.versionCode=30700`, and the four patcher files below are byte for byte v30.7's |
| Pinned release | `1.0.0` (published 2026-08-01), tag commit `b1b0247e5ba47d571fd5e97acf7ffbb785003118` |
| Release asset | `app-release.apk`, 13380464 bytes, sha256 `b6fddaab15bd104bb6cc00dcad987f7f26073537459f5477658659c13f229a0f` |
| Manager package | `org.magiskube.magisk`, compiled into its binaries (`native/src/include/consts.hpp` `JAVA_PACKAGE_NAME`, `native/src/include/consts.rs` `APP_PACKAGE_NAME`) |
| Licence | GPL-3.0, see LICENSE in this directory |
| Retrieved on | 2026-09-24 |
| Local modifications | none |

The release page also offers `app-debug.apk` (33202123 bytes, sha256
`581047ec39a390524606da43c63c564ee9bfa033bb70ac012fb3accd4f130da9`); nothing is taken from it, and the
older `release` tag of 2026-03-22 is not used either.

## What is bundled, and where each file comes from

| APK entry | Bundled as | Digest (sha256) | Written into the ramdisk as | Mode |
| --- | --- | --- | --- | --- |
| `lib/arm64-v8a/libmagiskinit.so` | `public/artifacts/magiskube/magiskinit` | `2f47ef9ff012bf7da2f38170fe1bc4eeea335bc273ec86a4daf31f06ded39ffe` | `init` | 0750 |
| `lib/arm64-v8a/libmagisk.so` | `public/artifacts/magiskube/magisk` | `6dd9eea6bcaa734edd1dd101cc88ce89adf6ebc73dc28231709a4354b1a3f680` | `overlay.d/sbin/magisk.xz` | 0644 |
| `assets/stub.apk` | `public/artifacts/magiskube/stub` | `77e727ebe42879fe9e98e9098b3af93caf6e8e35feaf59760db77ff0ecf57717` | `overlay.d/sbin/stub.xz` | 0644 |
| `lib/arm64-v8a/libinit-ld.so` | `public/artifacts/magiskube/init-ld` | `54ec98f3f93473e51252267a8997cd12878dd463263f3dc2a32c14ab7951f9f0` | `overlay.d/sbin/init-ld.xz` | 0644 |

Exact digests are in `src/core/artifacts/catalog.ts`, release `1.0.0` of provider `magisk`. Only the
arm64 payloads are bundled, because every provider here targets arm64.

To reproduce: `unzip` the four APK entries listed above from the release asset and rename them to
`magiskinit`, `magisk`, `stub` and `init-ld` (the last one is the APK's `assets/stub.apk`).

## The same patcher as Magisk v30.7

`scripts/boot_patch.sh` and the ramdisk patcher it drives (`native/src/boot/patch.rs`, `cpio.rs`,
`compress.rs`) are byte for byte Magisk v30.7's — the same files, modes, target paths, configuration
keys (`KEEPVERITY`, `KEEPFORCEENCRYPT`, `RECOVERYMODE`, `VENDORBOOT`, `PREINITDEVICE`, `SHA1`) and codec
settings (xz at `with_preset(9)` with a CRC32 check, `compress.rs:225`), and the same `lzma-rust2`
0.16.2 that magiskboot pins. What differs is its own build of the payloads, with the manager package
compiled in, so the two flavours cannot be mixed.

Two details worth recording, both read from the release rather than assumed:

* the payloads are the fork's own build, and one of them (`init-ld`) happens to be byte identical to
  WeaveMask's and different from Magisk's, which is a build-flag difference rather than a behaviour one;
* the bundled stub still declares `com.topjohnwu.magisk` in its manifest although the app it belongs
  to is `org.magiskube.magisk` (`app/stub/build.gradle.kts:13,21` keeps upstream's id). That is an
  inconsistency in the fork, and it does not affect a patch: the stub is the hidden-manager carrier,
  renamed by the app when it hides itself.

## What has and has not been verified here

* Verified: each bundled payload matches the digest above, the release asset matches its published
  SHA-256, and the patcher files are byte identical to Magisk v30.7's, so the settings this project
  reproduces byte for byte against Magisk's own app output apply unchanged.
* **Not verified**: no image produced by the MagisKube app itself was available, so the produced `.xz`
  streams have not been compared against that app's output. The same limitation is recorded for
  WeaveMask, and closing it needs one patched image from the app for a known source image.
