# Testing

Every stage has to pass before a commit, in one command:

    pnpm verify

which runs pnpm typecheck, pnpm lint, pnpm test and pnpm build in that order. CI runs the same four,
in .github/workflows/ci.yml.

`pnpm test` runs under vitest. Tests that need material which cannot live in this repository — a real
OTA package, a device dump, a third party module — **skip themselves**, and this page says where each
one looks. Nothing needs a device to run: the material was captured once, read only, and is kept in
`.research/` (which is gitignored) or pointed at with an environment variable.

## The two rules that shape the material tests

A byte level contract is verified **byte for byte against real material**, never against our own
expectations: the patched `init_boot` matches the device dump, the erofs and ext4 readers match
`sha256sum` taken on the device, a rebuilt splash image matches the partition it came from, and a
sparse image matches AOSP's `img2simg`.

When a format has a reference implementation, that implementation is read and cited (`file:line`) or
compiled to WebAssembly and used directly. The lz4 and bzip2 codecs in `public/wasm/` are the
reference C compiled by `scripts/build-lz4-wasm.sh` and `scripts/build-bzip2-wasm.sh`, and their
output is checked against the command line tools in the tests.

## The variables

| Variable | Supplies | Used by | Default when unset |
|---|---|---|---|
| `IMAGEFORGE_OTA_PACKAGE` | a full OTA package (the one used here is a CPH2723 full OTA, 8.2 GB) | `unit/package`, `unit/partition`, `unit/payload-source`, `unit/splash`, `unit/splash-bmp`, `unit/bzip2-reference`, `unit/sparse-write`, `fixtures/erofs` | those tests skip |
| `IMAGEFORGE_OTA_INIT_BOOT_SHA256` | the digest the OTA's `init_boot` must have, as an independent cross-check of the extraction | `unit/package` | the test skips |
| `IMAGEFORGE_ASTER_DUMP`, `IMAGEFORGE_STOCK_IMAGE`, `IMAGEFORGE_INIT_BOOT`, `IMAGEFORGE_VENDOR_BOOT` | device dumps of the boot partitions | `fixtures/artifacts`, `integration/ramdisk`, `unit/vendor-repack`, `unit/lz4` | `.research/aster-validation/{boot,init_boot,vendor_boot}.img` |
| `IMAGEFORGE_EROFS_DIGESTS`, `IMAGEFORGE_PAYLOAD_DIGESTS`, `IMAGEFORGE_EXT4_DIGESTS` | `sha256sum` output captured **on the device** for files inside erofs and ext4 images, and for payload partitions | `unit/partition`, `unit/payload-source` | `.research/aster-validation/erofs-product-digests.txt`, `erofs-payload-digests.txt`, `ext4-vendor_dlkm-digests.txt` |
| `IMAGEFORGE_BOOTANIMATION` | a real vendor boot animation archive (the one used here came out of the OTA's my_product partition) | `unit/bootanimation` | `.research/bootanimation/bootanimation.zip` |
| `IMAGEFORGE_MTK_LOGO` | a real MediaTek `logo.img` | `unit/mtk-logo` | `.research/mtk-logo/sample-logo.img` |
| `IMAGEFORGE_LPMAKE` | AOSP's `lpmake`, which the super image writer is compared against byte for byte (`lpdump` and `lpunpack` from the same package read its output back) | `unit/super-write` | `/usr/bin/lpmake` |
| `IMAGEFORGE_IMG2SIMG` | AOSP's `img2simg`, which the sparse writer is compared against byte for byte | `unit/sparse-write` | `/usr/bin/img2simg` |
| `IMAGEFORGE_KERNELSU_MODULE`, `IMAGEFORGE_KERNELSU_REFERENCE`, `IMAGEFORGE_MAGISK_REFERENCE`, `IMAGEFORGE_KPM_DIR`, `IMAGEFORGE_TEST_KPM`, `IMAGEFORGE_TEST_IMAGE` | the third party modules and stock images the patch providers are checked against | `fixtures/artifacts` and the provider tests | `.research/kpm`, `.research/images/…` |

## What each reader is checked against

The rule that came out of the reference-first work: no reader is verified only against something this
project wrote. Each one has at least one test where the bytes come from somewhere else — a device, a
vendor image, or the reference implementation itself.

| Reader | The bytes it is checked against |
|---|---|
| boot and vendor_boot headers | device dumps of init_boot and vendor_boot |
| zip, zip64, OTA payload | the 8.2 GB full OTA package |
| xz, bzip2, gzip | the payload's REPLACE_XZ and REPLACE_BZ operations, and bunzip2 for the stream a Rust decoder got wrong |
| sparse | simg2img's own output, and this writer read back by simg2img |
| super and its logical partitions | lpmake's output, read back with lpdump and lpunpack |
| erofs, including LZ4 | sha256sum taken on the device for files inside the image |
| ext4 | the same, for the modules in vendor_dlkm |
| splash | the real splash partition of the OTA |
| MediaTek logo | a real logo.img from the public dataset named above |
| the lz4 and bzip2 codecs | the reference C compiled to wasm, checked against the command line tools |

## How the material was captured

The boot partitions came from a rooted device with read-only commands, run by hand:

    adb shell su -c 'dd if=/dev/block/by-name/init_boot of=/sdcard/init_boot.img'
    adb pull /sdcard/init_boot.img

The digest files are the output of `sha256sum` for files read on that device, one line per file, so a
reader here can be checked against the same bytes the device holds. The boot animation was read straight
out of the OTA's my_product partition with this project's own EROFS reader, from /media/bootanimation:
bootanimation.zip (1,644,551 bytes, sha256 02b982a1dbe4f9ed...) and rbootanimation.zip, the shutdown
animation (411,754 bytes, sha256 b92a7b78581568f2...).

The MediaTek sample came from the
HuggingFace dataset `offici5l/fcetool`, which mirrors whole OTA files; its `logo.img` has sha256
`b922e04c2c0d00317535411ff27cc2690a6e66136cbd8d94f9c47a7466264022`. Details and citations for each
format are in `.research/memory/` and `.research/mtk-logo/NOTES.md`.

The application never touches a device, and ImageForge never flashes one: a run ends at a downloaded
image. The capture steps above are what produced the fixtures, not something the tools do.

## Damaged input

The suite does not only check that a reader understands the files it was written for; it checks what it
does with files that were damaged. tests/unit/robustness.test.ts truncates and byte-flips a copy of
every fixture, across eleven formats, and holds two rules: a reader either produces a result that agrees
with the whole file, or it refuses the file with an error of its own. A TypeError, a RangeError, an
out-of-range read, or a result that quietly lost something is a failure.

The numbers it prints are the evidence: of 116 truncations, 91 were refused with an error of this
project's own, and the 25 that still parsed produced results identical to the whole file's — the
truncations that only cut trailing padding. The test also asserts that at least twenty are refused, so a
suite that stopped testing anything could not pass by being quiet.

What each reader refuses, by name, is part of that promise:

| Reader | Refuses, with a reason it can name |
|---|---|
| erofs | chunk based files (EROFS_FEATURE_INCOMPAT_CHUNKED_FILE); bad superblock or inode geometry |
| ext4 | features this build does not implement (checked in one place, checkExt4Supported) |
| sparse | chunk types it does not know, and chunks that run past the end of the file |
| super (liblp) | target types other than linear and zero, and metadata whose checksums or geometry do not add up |
| boot, init_boot, vendor_boot | header versions it does not know, and truncated headers |
| zip, payload | an archive or payload that ends before its own tables do; delta partitions with no source |
| splash | frames that are not 24 or 32 bit uncompressed BMPs |
| MediaTek logo | blocks whose length no resolution explains (those are left alone rather than guessed at) |
| boot animation | an archive with no desc.txt, and a desc.txt that declares no animation |

## Adding a test that needs material

Skip it when the material is absent and name the variable here, in the same paragraph as the others,
so the next person knows what to point the suite at. A test that silently passes without material is
worse than one that skips.
