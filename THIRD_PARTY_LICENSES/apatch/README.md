# apatch

Status: **three KernelPatch core images bundled**.

ImageForge ships the KernelPatch core image (`kpimg`) that APatch injects into kernel
images. Three flavours are bundled because each build only trusts the manager app it was built
for, and a patch made with one flavour is only usable with that manager.

## 1. Upstream KernelPatch (default)

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/bmax121/APatch |
| Pinned revision | `99fbd65d5ed2c8f3fa30f0ab3720213efa3592f3` |
| Release used for the artifact | `11224` (`APatch_11224_9a63e0f_HEAD-release-signed.apk`) |
| File inside the release package | `assets/kpimg` |
| Reported version | KernelPatch image `0.13.3`, config `android,release`, arch `arm64`. The header carries it as the packed value `0xd03` = `VERSION(major 0, minor 13, patch 3)`, not as an offset (`kernel/include/preset.h:54,56-61`) |
| Trusted manager | `me.bmax.apatch` |
| Bundled artifact | `public/artifacts/apatch/kpimg`, 190816 bytes, sha256 `8f472d389d00f11c2d34c7059e1df8d580b9cb7d8c9f99b70877801b52992e2a` |
| License | GPL-3.0-or-later (LICENSE in this directory) |
| Local modifications | none (redistributed byte for byte) |

## 2. Aster fork

| Field | Value |
| --- | --- |
| Fork repository | https://github.com/LyraVoid/KernelPatch-Aster |
| Pinned revision | `0ff4ae2b8cad8058c408d8a5bdb12569b1a84981` (2026-09-15) |
| Base | upstream KernelPatch `72a904c4` (0.13.8) plus one commit |
| Local modifications | `aster: trust the Aster manager, and accept its v2+v3 signature` — touches only `kernel/patch/android/userd.c` and `lkm/manager/apk_sign.c`. The trusted manager list is reduced to `me.yuki.aster` with the SHA-256 of that APK's v2 signing certificate, and a v3 signature next to v2 is no longer rejected. `tools/` (what kptools is built from) is untouched. |
| Reported version | KernelPatch image `0.13.8` (packed header value `0xd08`), compile time `05:10:47 Sep 15 2026` |
| Trusted manager | `me.yuki.aster` |
| Release used for the artifact | `0.13.8` (`LyraVoid/KernelPatch-Aster`), asset `kpimg-android` |
| Bundled artifact | `public/artifacts/apatch/kpimg-aster.bin`, 340880 bytes, sha256 `429718afcabe5bbcf51389ce41a2c983940b3392fb3fa20b99454f3465849a94` |
| Test fixtures from the same release | `tests/fixtures/kernelpatch/demo-hello.kpm` (sha256 `db436f009757563740e5af864588625104d7c1de2e6da69b6b742fc35f35668b`) and `demo-inlinehook.kpm` |
| License | GPL-2.0-or-later (inherited from upstream KernelPatch; see THIRD_PARTY_LICENSES/kernelpatch/) |

### Provenance

The artifact is the official `kpimg-android` asset of the fork's `0.13.8` release:

    https://github.com/LyraVoid/KernelPatch-Aster/releases/download/0.13.8/kpimg-android

It reports KernelPatch image `0.13.8` with compile time `05:10:47 Sep 15 2026`, 43 seconds
after the commit time of `0ff4ae2` (`2026-09-15 13:10:04 +0800` = `05:10:04 UTC`).

A boot partition dumped from a device flashed with a build of the same revision carries a
kpimg that differs from this asset in 107 bytes, all inside the preset area that kptools
rewrites when it embeds the image. Both files produce an identical patched kernel, which is
why the reproduction check below still passes with the release asset.

## Verified reproduction

Patching the stock boot image of the source device with the bundled Aster core image
reproduces the flashed boot image byte for byte:

    stock kernel        36731392 bytes  sha256 d4d2cbf9... (first 16)
    flashed kernel      37073936 bytes  sha256 8271f9661809caf9e0e280a2e3e331693b6877126b7c392e9354ec7ad9ec1507
    our patched kernel  37073936 bytes  sha256 8271f9661809caf9e0e280a2e3e331693b6877126b7c392e9354ec7ad9ec1507
    differing bytes     0

The test that enforces this is
`tests/integration/apatch-aster-reproduction.test.ts`; it runs when a stock image and a
flashed dump are supplied through `IMAGEFORGE_STOCK_IMAGE` and `IMAGEFORGE_ASTER_DUMP`.

The same kernel was also reproduced with the fork's official `kptools-linux` release binary,
and our WebAssembly build of kptools produced byte identical output to it, so the toolchain
used in the browser matches the released native tool.

## 3. FolkPatch

| Field | Value |
| --- | --- |
| Manager repository | https://github.com/LyraVoid/FolkPatch (GPL-3.0) |
| Core image repository | https://github.com/LyraVoid/KernelPatch |
| Pinned revision | `1de1a37304406615a3c3b6f1d28d2cd926b93a0f` (tag `0.13.8`, released 2026-08-31) |
| Manager app pin | `LyraVoid/FolkPatch` tag `kp0.13.8`, commit `155eb044af5abd816db6409328a37dd5ac50b1f1` (release `kp0.13.8`, 2026-08-31; asset sha256 `0b1671fe42a565a4fb8a573ac9b480febe11189380f96c83ccbe29fdfd375890`). The app is GPL-3.0; not bundled, only named here because the core image below is the one built for it |
| Base | upstream KernelPatch `72a904c4` (0.13.8) plus the extended branch's own commits |
| Local modifications | the extended branch adds its own hooks — among them `folkpatch_pathhide`, `folkpatch_netisolate`, `folkpatch_suaudit` and `folkpatch_uts` — and reduces the trusted manager list to `me.yuki.folk` with the SHA-256 of that APK's v2 signing certificate. `tools/` still builds a complete kptools, and the image format is the same `KP1158` as upstream. |
| Reported version | KernelPatch image `0.13.8` (packed header value `0xd08`), compile time `08:03:59 Aug 31 2026` |
| Trusted manager | `me.yuki.folk` only. The trust table is compiled in (`kernel/patch/android/userd.c:85-95`: the package plus the SHA-256 of its signing certificate), and the released app is signed with exactly that certificate — checked with `keytool -printcert`, digest `a9eba5b7 02eb55fb 5f4b1a67 2a7133a1 6a7bcaea 949cde43 c812ef26 c77de812`. `tests/unit/bundled-artifacts.test.ts` also holds the bundled images to this: the bytes of the core image this flavour uses name `me.yuki.folk` and none of the other registered managers |
| Release used for the artifact | `0.13.8` (`LyraVoid/KernelPatch`), asset `kpimg-android` |
| Bundled artifact | `public/artifacts/apatch/kpimg-folk.bin`, 474640 bytes, sha256 `d22352eee8bc1452436b1c3ee9ba7ebfb4408a1ba93456f02333a23c56df1509` |
| License | GPL-2.0-or-later (inherited from upstream KernelPatch; see THIRD_PARTY_LICENSES/kernelpatch/) |

### Provenance

The artifact is the official `kpimg-android` asset of that release, byte for byte:

    https://github.com/LyraVoid/KernelPatch/releases/download/0.13.8/kpimg-android

It is the same file the FolkPatch app carries in its own APK (`assets/kpimg`), so the bytes
ImageForge injects are the bytes the manager expects. Its version and compile time are the
ones the release was built at, and the same release also publishes the matching
`kptools-android` and `kptools-linux`.

### Verified reproduction

The branch's core image is not injected by the branch's own tool in this project: ImageForge
uses its WebAssembly `kptools`, built from *upstream* KernelPatch `72a904c4`. That the two
agree was checked rather than assumed — patching the same stock kernel with both the
released native `kptools-linux` and our WebAssembly build produces byte identical output:

    stock kernel        36731392 bytes
    native patched      37207696 bytes  sha256 30f2c354333223e7... (first 16)
    our patched kernel  37207696 bytes  sha256 30f2c354333223e7... (first 16)
    differing bytes     0

`tests/integration/folkpatch-reproduction.test.ts` runs that comparison in both directions
live, and skips itself unless the branch's `kptools-linux` is supplied through
`IMAGEFORGE_FOLKPATCH_KPTOOLS` (by default the copy in
`.research/folkpatch-release/0.13.8/`).
