# Changelog

## 0.2.0

A round of adding managers, and of making the register behind them hold up.

**More managers**

- **FolkPatch** joins APatch as a third KernelPatch core image. Its core image comes from an extended
  branch of KernelPatch rather than from upstream, so the interesting part was showing that this
  project's WebAssembly kptools injects it identically: patching the same stock kernel with the
  branch's own native `kptools-linux` and with the browser build produces the same bytes, which a test
  now runs in both directions.
- **WeaveMask** and **MagisKube** join Magisk as flavours. Both are forks whose patcher *is* Magisk
  v30.7's — `boot_patch.sh` and the ramdisk patcher it drives are byte for byte the same files — while
  their payloads and their manager apps are their own (`io.github.seyud.weave` and
  `org.magiskube.magisk`). The patch page picks the manager, and the result names the app the image
  needs.
- **SukiSU, ReSukiSU, YukiSU and KowSU** join KernelSU: the provider now covers the whole family, since
  every manager compiles its modules against its own signing certificate and they cannot be mixed. Each
  is a flavour with its own wrapper and its own eight modules, and the run records which manager it was
  made for. YukiSU is the one that also stores its early boot settings inside the module, which is
  reproduced from its own headers rather than approximated.

**Registration and verification**

- Every bundled WebAssembly module is now digest verified before it is instantiated, with its digest
  and its licence record tied together by tests; `bzip2.wasm` gained an npm build script.
- Bundled payloads are held to what they claim to be, not only to their digest — a module has to be a
  relocatable ELF named `kernelsu` whose vermagic matches its KMI, a wrapper an executable rather than
  a module, a core image has to start with `KP1158`, a stub has to be an APK. That check found one: the
  KernelSU module for `android13-5.15` in this repository was the HTML page a failed download had left
  behind, and its digest had been recorded as if it were the artifact. It is replaced, and the class of
  mistake is now guarded.
- Payloads that their projects publish only inside an APK are recovered with
  `scripts/scan-embedded-elf.py`, validated against a manager whose archives are published, and each
  module is filed under the KMI its own `vermagic` names — which the provider checks again at patch
  time.

**Before publishing**

- `NOTICE` was wrong: it still listed Magisk and KernelSU as "referenced but not bundled" after both
  had become bundled, and it did not mention the forks. It now lists every bundled component, its
  licence and the fact that none of them is affiliated with this project.
- `CONTRIBUTING.md` (how to work here, and the checklist for adding a manager or an artifact),
  `SECURITY.md` (what is in scope, and what to report upstream instead) and `CODE_OF_CONDUCT.md`
  exist now, with issue forms that ask for the diagnostics export and a pull request template that
  has a section for what you could *not* verify.
- The readme was rewritten around what the tool does and what it can be trusted with, with two
  screenshots of the running interface, and it now opens with what flashing a patched image can cost
  you. Its links and screenshots are checked by a test, so a page that names a file which no longer
  exists fails the suite. The verification model it used to carry moved into `docs/architecture.md`.
- The readme exists in three languages now — English, Simplified Chinese and Japanese — each with a
  switcher at the top, the project mark above the name. The mark is a real SVG file and both the
  installed icons and the header draw the same colours, which they had not: the generated icons were
  a shade off the token colours the interface uses.
- The version is 0.2.0.
- **The version is now shown where it should be and comes from one place.** The header badge had
  been hardcoded at "v0.1" since the first release while the settings page showed nothing; both, and
  the version in an exported diagnostics report, now read `package.json` through a build time
  constant, and a test compares what the interface renders with what the package says.
- **The toolchain is pinned and the CI matches it**: `packageManager` names the pnpm version, `engines`
  names Node 22.13+ (what pnpm 11 requires), and CI installs both from those fields.

**Fixed before anyone deployed it**

- **The app insisted on WebCrypto to verify the WebAssembly module, and a host that serves the site
  over plain HTTP has none** — so a deployment could fail with "The digest of
  /wasm/imageforge.wasm could not be checked: WebCrypto SubtleCrypto is not available in this
  runtime", and the settings page then advised rebuilding a module that was there all along. Hashing
  now falls back to an audited JavaScript implementation (`@noble/hashes`, loaded only when needed),
  so digests are verified everywhere and the payloads stay checked; the advice was removed, and the
  deployment requirements — root path, single-page fallback, HTTPS — are written down in the readme.

**Corrections**

- magiskboot links `lzma-rust2` 0.16.2, not the 0.21.0 this project uses; the output is identical for
  the payloads Magisk ships, which is what the real-material test asserts, but the explanation was
  wrong in four places.
- The KernelPatch message for an already patched kernel no longer names two managers by hand.

## 0.1.0

The first release. Everything runs in the browser: no server, no upload, and nothing is ever flashed to
a device — a run ends at a downloaded image.

**Tools**

- **Patch**: APatch, KernelSU and Magisk patching of Android boot images, checked byte for byte against
  what the official apps produce.
- **Extract**: OTA packages and zips (zip64, an 8 GiB payload read in ranges), with the payload codecs
  for REPLACE, REPLACE_XZ and REPLACE_BZ — the last one decoding with the reference bzip2 compiled to
  WebAssembly after a hand written decoder disagreed with a real stream.
- **Unpack**: sparse images, super images (liblp), EROFS (including LZ4) and ext4, browsed in ranges, plus
  writing sparse images back out byte for byte like img2simg and super images like lpmake.
- **Compare**: what changed between two images, byte by byte, naming the section of a boot image each
  difference falls in.
- **Boot logo**: OPPO/Realme/OnePlus splash images and MediaTek logo images, edited and repacked with
  untouched frames kept byte for byte.
- **Boot animation**: play a bootanimation.zip, replace frames, edit desc.txt and pack it again.
- **Inspect**: read-only analysis of images, partitions, ramdisks and metadata.

**Under it**

- A workspace that survives a reload (IndexedDB), a visible way to wipe it, and installable offline use
  through a service worker.
- Progress for long jobs rather than a spinner with no end in sight.
- Four languages, and docs for the architecture, the usage and how the tests are supplied with material.

**How it is checked**

Every byte level format was implemented against a reference implementation and verified against real
material: a full OTA, device dumps, a real MediaTek logo image, a real boot animation, and the AOSP tools
(img2simg, simg2img, lpmake, lpdump, lpunpack) compared byte for byte. A reader either understands a file
or refuses it with an error of its own; damaged input is part of the test suite.
