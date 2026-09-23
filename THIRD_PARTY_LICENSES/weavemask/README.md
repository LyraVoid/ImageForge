# weavemask

Status: **bundled**.

WeaveMask is a fork of Magisk, so it is GPL-3.0 throughout, exactly like the project it forks:
there is no per-directory split, and the upstream Magisk licence text applies unchanged. Its payloads
can therefore be redistributed with this AGPL-3.0-or-later project as separate, unmodified programs.

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/Seyud/WeaveMask (fork of https://github.com/topjohnwu/Magisk) |
| Pinned release | `v30.7.5` (published 2026-05-25), tag commit `296ec21ab0becbacab9f2cb7346d930ef1fcfed7` |
| Release asset | `WeaveMask-v30.7.5.apk`, 12886119 bytes, sha256 `a903811d0a784b0f1b4b3ce7c56b44f91e9854d7eb664e1fe9dace845d350b16` |
| Licence | GPL-3.0, see LICENSE in this directory (byte identical to Magisk's, sha256 `589ed823e9a84c56feb95ac58e7cf384626b9cbf4fda2a907bc36e103de1bad2`) |
| Retrieved on | 2026-09-24 |
| Local modifications | none |

The repository to use is `Seyud/WeaveMask`: it is the fork that publishes releases. `Shiho-Patch/WeaveMask`
is an older snapshot of the same work (its branch is 88 commits behind and it has no releases), so
nothing is taken from it.

## What is bundled, and where each file comes from

| APK entry | Bundled as | Digest (sha256) | Written into the ramdisk as | Mode |
| --- | --- | --- | --- | --- |
| `lib/arm64-v8a/libmagiskinit.so` | `public/artifacts/weavemask/magiskinit` | `b3df27f76fa68ee477efe36c6ecd6942ba3f7246e90c86540f2f22072103b948` | `init` | 0750 |
| `lib/arm64-v8a/libmagisk.so` | `public/artifacts/weavemask/magisk` | `4e62c1f7ba3f5af7b790e718c5b263a7da44cf9c8a749497d6652a216ecc2023` | `overlay.d/sbin/magisk.xz` | 0644 |
| `assets/stub.apk` | `public/artifacts/weavemask/stub` | `589013c08c2d26ff5cb6d8fc6cbcffa71cfcfdd7662d4ba358d155b61b8f147f` | `overlay.d/sbin/stub.xz` | 0644 |
| `lib/arm64-v8a/libinit-ld.so` | `public/artifacts/weavemask/init-ld` | `54ec98f3f93473e51252267a8997cd12878dd463263f3dc2a32c14ab7951f9f0` | `overlay.d/sbin/init-ld.xz` | 0644 |

Exact digests are in `src/core/artifacts/catalog.ts`, release `v30.7.5` of provider `magisk`. Only the
arm64 payloads are bundled, because every provider here targets arm64.

To reproduce: `unzip` the four APK entries listed above from the release asset and rename them to
`magiskinit`, `magisk`, `stub` and `init-ld` (the last one is the APK's `assets/stub.apk`).

## The same patcher as Magisk v30.7

This is not a similar patcher, it is the same one. `scripts/boot_patch.sh` and the ramdisk patcher it
drives (`native/src/boot/patch.rs`, `cpio.rs`, `compress.rs`) are byte for byte Magisk v30.7's — the
same files, the same modes, the same target paths, the same configuration keys
(`KEEPVERITY`, `KEEPFORCEENCRYPT`, `RECOVERYMODE`, `VENDORBOOT`, `PREINITDEVICE`, `SHA1`), and the same
codec settings (xz at `with_preset(9)` with a CRC32 check, `compress.rs:225`). What differs is
WeaveMask's own:

* the manager package is `io.github.seyud.weave` instead of `com.topjohnwu.magisk`, which is compiled
  into its magiskinit (`native/src/init/consts.hpp`, `native/src/core/consts.rs`);
* all four payloads are WeaveMask's own builds, so every digest in the table above differs from
  Magisk's even though two of the files have the same size.

Because of the first point, an image patched with these payloads needs the WeaveMask app, and the two
flavours cannot be mixed: `magiskinit` looks for the stub and the manager under its own package.

## What has and has not been verified here

* Verified: each bundled payload matches the digest above, and the release asset it came from matches
  its published SHA-256; `tests/integration/weavemask.test.ts` also patches a real `init_boot.img` and
  checks the resulting ramdisk entry by entry.
* Verified: the patcher is byte identical to Magisk v30.7's, so the settings this project reproduces
  byte for byte against Magisk's own app output (`tests/integration/magisk.test.ts`, material supplied
  through `IMAGEFORGE_MAGISK_REFERENCE`) apply unchanged to a WeaveMask patch.
* **Not verified**: no image produced by the WeaveMask app itself was available, so the produced
  `.xz` streams have not been compared against WeaveMask's own output the way Magisk's have. Doing so
  needs one patched image from that app for a known source image; until then this record says so
  rather than implying the stronger claim.
