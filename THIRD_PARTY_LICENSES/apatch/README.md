# apatch

Status: **two KernelPatch core images bundled**.

ImageForge ships the KernelPatch core image (`kpimg`) that APatch injects into kernel
images. Two flavours are bundled because each build only trusts the manager app it was built
for, and a patch made with one flavour is only usable with that manager.

## 1. Upstream KernelPatch (default)

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/bmax121/APatch |
| Pinned revision | `99fbd65d5ed2c8f3fa30f0ab3720213efa3592f3` |
| Release used for the artifact | `11224` (`APatch_11224_9a63e0f_HEAD-release-signed.apk`) |
| File inside the release package | `assets/kpimg` |
| Reported version | KernelPatch image `0.13.3` (`0xd03`), config `android,release`, arch `arm64` |
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
| Reported version | KernelPatch image `0.13.8` (`0xd08`), compile time `05:10:47 Sep 15 2026` |
| Trusted manager | `me.yuki.aster` |
| Bundled artifact | `public/artifacts/apatch/kpimg-aster.bin`, 340880 bytes, sha256 `8c506ca7a445af8734ca4218bebffd2afeadb023d2c6ac16ce466fceb25f842c` |
| License | GPL-2.0-or-later (inherited from upstream KernelPatch; see THIRD_PARTY_LICENSES/kernelpatch/) |

### Where this artifact came from

It was extracted from a boot partition dumped from a device that had been flashed with a
build of that revision, not from a release package. The provenance was verified as follows:

* the embedded compile time `05:10:47 Sep 15 2026` is 43 seconds after the commit time of
  `0ff4ae2` (`2026-09-15 13:10:04 +0800`, i.e. `05:10:04 UTC`);
* `kptools -v -k` reports `d08`, matching the fork's `version` file (0.13.8);
* injection is verified to be reproducible on the supplied material.

Ideally this file would be replaced by the fork's own release artifact. If that happens, only
the SHA-256, size and source note in `src/core/artifacts/catalog.ts` need to be updated.

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
