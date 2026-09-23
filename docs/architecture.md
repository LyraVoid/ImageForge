# Architecture

ImageForge is layered so that the UI never touches binary parsing and a patch provider
never parses a raw `boot.img` itself.

## Layers

    UI / UX Layer            React components, routes, design system
            |
    Application Layer        Zustand store, worker client, navigation
            |
    Patch Engine             Planner -> Resolver -> Executor -> Verifier
            |
    Compatibility Engine     image metadata -> provider candidates
            |
    Artifact Registry        releases, artifacts, digests, architectures
            |
    Patch Providers          one implementation per patch method
            |
    Image Engine             Parser / Extractor / Transformer / Repacker / Verifier
            |
    Web Worker               task execution, Comlink RPC, progress events
            |
    WASM                     binary helpers and bundled upstream tools

## Tools

The site is a set of tools, and the patcher is one of them (`src/app/tools.ts` holds the list as
data: id, path, title and description keys, status, and whether the tool is a flow). Consequences:

* **The workflow steps belong to the patcher.** `isPatchFlow` decides whether the header and the
  mobile bar show the step indicator, so a single-page tool is not squeezed into a five step shape.
* **The tools page is the landing page, and the patcher is its primary card**, with the dropzone
  already on it: the most common task must not need a click to start. Single tools (extract,
  unpack, logo, inspect) are cards with a status badge; a planned tool is rendered but disabled.
* **The patcher's routes are namespaced** (`/tools/patch/image|analyze|plan|run|result`). The paths
  it used before the tools page existed (`/analyze`, `/patch`, `/processing`, `/result`) stay
  valid as redirects, because they were the address of a working flow.
* **A tool is not a route convention, it is a declaration.** When a new tool needs to consume what
  another produced (an extracted partition image, for example) it will declare the artifact kinds it
  accepts and produces, and the UI will offer the tools that match the current selection — the way
  the compatibility engine already lists the providers that match an image.

## The workspace

A site with several tools needs a memory of what the user is holding, and the patcher's single
`File` is not it. The worker session owns a **workspace**: the sources the user opened, and the
artifacts tools derived from them.

* `src/core/workspace/detect.ts` classifies bytes by magic into a **container** (raw, zip, OTA
  payload, sparse, gzip, LZ4, xz, zstd, …) and a **content** (boot, init_boot, vendor_boot, ext4,
  erofs, f2fs, dtb, elf), then maps that to an **artifact kind**. Vendor boot logo containers are
  deliberately absent from that table: their magics are not verified here yet, so a logo image is
  reported as a blob instead of guessed at.
* `src/core/workspace/kinds.ts` is the vocabulary tools match on: package, partition-image,
  boot-container, filesystem, ramdisk, logo-container, report, blob.
* `src/core/workspace/graph.ts` keeps sources, artifacts and their lineage: an artifact records the
  source it belongs to, the artifact it was derived from, the tool and its parameters. Closing a
  source drops its whole lineage with it, because the bytes came from it.
* `src/core/workspace/matching.ts` answers which tools apply to a selection, in the same shape the
  compatibility engine uses for images: a verdict plus stable reason codes the interface words itself
  (`src/i18n/engine-keys.ts`).
* Bytes never leave the worker. The main thread holds metadata only, and `readArtifact(id, offset,
  length)` reads a range when something has to look inside a large image. The workspace shares the
  session with the patcher, so opening an image and then patching it does not copy it.

The entry point follows from that: opening a file puts it in the workspace, reports what it is, and
either continues into the patcher (a boot image) or names the tools that accept it — with a planned
tool shown, disabled, and saying why.

## Packages

Two container formats deliver an Android image, and `src/core/package/` reads both. A real OTA
package is **8 GiB**, so nothing here works on a buffer: everything takes a {@link ByteSource}
(`source.ts`) — a size plus `read(offset, length)` — and reads the ranges it needs.

* **Reading in ranges** (`source.ts`). `bytesSource` wraps a buffer (tests, small entries),
  `blobSource` wraps a `Blob`/`File` and reads through `slice().arrayBuffer()` — in the browser a file
  input hands over a *handle*, not a buffer — and `subSource` is a window onto another source. The
  last one is how a payload inside an OTA zip is read in place. The worker holds the handle
  (`openSource` accepts an `ArrayBuffer` or a `Blob`) and detection reads an 8 KiB prefix: headers,
  magics and superblocks all live there, so nothing large is ever loaded to classify it.
* **zip** (`zip.ts`): the end record (32 and **64 bit**), the central directory and the local headers.
  Zip64 sizes and offsets live in the `0x0001` extra field, and vendor packages append a signature
  after the end record, so the tail window is wider than the format's own limit. Stored entries are
  opened in place (`storedEntrySource`); deflated ones are expanded with
  `DecompressionStream("deflate-raw")` and have to fit in memory. Every entry's CRC32 is checked.
* **OTA payload** (`payload.ts`): the `CrAU` header, the protobuf manifest and the blob area, with the
  field numbers taken from magiskboot's own `update_metadata.proto` and its reader
  (`native/src/boot/payload.rs`). The manifest is parsed by a hand written wire reader
  (`protobuf.ts`), so no protobuf runtime joins the bundle. Partitions are rebuilt from their
  operations in blob order, each blob read as its own range; `REPLACE`, `REPLACE_XZ`,
  `REPLACE_BZ` and `ZERO`/`DISCARD` are implemented, every blob is verified against
  `data_sha256_hash` and the rebuilt partition against its `new_partition_info.hash`. The declared
  `minor_version` is recorded but **not** used to decide anything: vendor full packages in the wild
  declare a non-zero one (a CPH2723 full OTA says 9) while every operation still carries its own
  data. What decides is per partition: an operation that reads the source image (`SOURCE_COPY`,
  the diff formats) marks that partition `requiresSource` and it is refused by name.

A payload inside an OTA zip is **descended into, not extracted**: its partitions are listed as
entries of the package (`payload.bin::init_boot`), because handing out an 8 GiB file is not something
a browser can do.

What an entry *is* never comes from its name: extraction produces bytes, and `detectArtifact`
classifies them, which is why an `init_boot` pulled out of an OTA is offered to the patcher
immediately. The blobs stay in the worker throughout: extraction registers a workspace artifact, and
the patcher reads that artifact where it already is (`analyzeArtifact`). What extraction *does*
hold in memory is the entry it returns, so it refuses anything above a documented limit instead of
silently trying.

## Partition containers

A partition dump is usually not the partition: it is wrapped, or it is a filesystem. Each wrapper has
its own reader, and all of them work through a `ByteSource` so a multi gigabyte image is read in
ranges rather than loaded.

* **sparse** (`sparse.ts`, from AOSP's `libsparse/sparse_format.h`): the 28 byte header and its RAW,
  FILL, DONT_CARE and CRC32 chunks. Unpacking rebuilds the image the sparse file stands for and checks
  the header's image checksum — don't-care blocks count as zeros, which is what the format says.
* **super** (`lp.ts`, from `liblp`'s `metadata_format.h` and `utility.cpp:84`): the geometry (its
  SHA-256 verified), the metadata header and tables (verified too: header checksum over the header
  with the checksum field zeroed, tables checksum over the tables), the partition, extent, group and
  block device tables, and `logicalPartitionSource`, which maps a logical partition's extents into a
  source of its own — that is what lets a partition be read out of a super image without copying the
  image. An extent that is not a plain linear mapping on block device 0 is refused by name.
* **erofs** (`erofs.ts`, from the kernel this device runs: Linux v6.6 `fs/erofs`): the superblock at
  1024, inodes at `meta_blkaddr << blkszbits + nid << 5` (`internal.h:307`, `super.c:390`) in both
  the 32 byte compact and the 64 byte extended form, directory entries (12 bytes followed by names,
  with the array ending where the first name begins), and file data for inodes stored flat or with an
  inline tail — the inline bytes start after the inode *and its xattr body* (`inode.c:123-125, 222`).
* **erofs compressed data** (`erofs-z.ts`, from `zmap.c` and `decompressor.c`): a compressed inode
  carries a map header at `ALIGN(iloc + inode_isize + xattr_isize, 8)` (`zmap.c:603`), then one
  lcluster index per logical cluster — either the 8 byte form or the packed one, which is 4 bytes
  until the area is 32 byte aligned and 2 bytes for the aligned run (`decode_compactedbits`,
  `zmap.c:83`; `unpack_compacted_index`, `zmap.c:118`). A cluster is PLAIN (copied raw, the
  "shifted" transform of `decompressor.c:320`), the HEAD of an LZ4 pcluster, or a NONHEAD pointing
  back at its head; how far a pcluster reaches and how long it is come from
  `z_erofs_get_extent_decompressedlen` (`zmap.c:410`) and `z_erofs_get_extent_compressedlen`
  (`zmap.c:337`). With the zero-padding feature the LZ4 stream does **not** start at the pcluster's
  first byte: `z_erofs_fixup_insize` (`decompressor.c:190`) skips leading padding zeros, which is the
  difference between a decodable block and "invalid LZ4 block".
  Refused by name, because each is a feature of its own: files in the packed inode (fragments),
  interlaced pclusters, inline pclusters, and any algorithm other than LZ4.
* **ext4** (`ext4.ts`, from `fs/ext4/ext4.h`, `ext4_extents.h` and `namei.c`, Linux v6.6): the
  superblock and its feature set, inodes at `bg_inode_table * blockSize + index * inodeSize`, the
  extent tree (any depth, with `ee_len > 32768` extents read as zeroes instead of being read from
  disk), linear directories, and hash indexed directories through the `dx_root` index
  (`namei.c:228`: a count/limit pair, then hash/block pairs where the block is a *logical* block of
  the directory). Refused by name: inodes without extents (the old indirect block map), meta block
  groups, inline data directories and encrypted directories.

Both filesystems are checked against the device itself: a test reads a `sha256sum` listing taken
from the running system and has to reproduce every digest from the image.

The paths the device never exercised have hand built fixtures (`tests/fixtures/erofs.ts`,
`tests/fixtures/ext4.ts`): the compressed erofs path, a hash indexed directory and a two level extent
tree. That is not busywork — the erofs fixture immediately exposed a real bug (a flat inode keeps
whole blocks, including a partial last one, so a file smaller than a block read back as zeroes) and
the ext4 one exposed that an indexed directory's root block holds dirents only up to its index.

The shape of a real device shows in what gets used: on a CPH2723 (Android 16) the OTA carries 54
partitions where `system`, `vendor`, `product`, `system_ext`, `odm` and `my_stock` are erofs and
`vendor_dlkm` is ext4, so erofs is what a listing has to understand first.

## Splash images

OPPO / Realme / OnePlus devices on Qualcomm keep their boot screen in a `splash` partition whose
format this project's own FolkSplash tool established (same author, same licence; its Dart sources
are kept in `.research/folksplash/` while this port is written). Offsets in bytes:

    0x0000  optional DDPH block (magic "DDPH", one flag)
    0x4000  "SPLASH LOGO!"
    0x400C  three 0x40 byte blocks the format keeps verbatim
    0x40CC  0x40 zero bytes
    0x410C  imgnumber, unknow, width, height, special
    0x4120  one 0x80 byte entry per frame: offset, real size, compressed size, name[0x74]
    0x8000  the frames, back to back: a gzip stream each, holding a 24 bit BMP

Two things about it are load bearing. The frames are stored back to back, so a repack that touches
one frame can copy every other frame's bytes verbatim — a repack that changes nothing is byte for
byte the input. And the header's width and height are **not** a bound on the frames: the device this
was read from declares 1080x1920 while its frames are up to 1440x3168, so resizing to the header
would shrink the images the panel really shows.

The frames are 24 bit BMPs, and the codec that reads and writes them matches the vendor's own
output down to the quirks: the resolution fields are copied from the frame being replaced (real
frames use 2834, 2835 or 0), some frames carry a couple of trailing bytes that their size fields
count, and a frame that is decoded and encoded again comes back byte for byte. Resizing is a
bilinear resampler in this repository rather than a canvas, so the result is deterministic and can
be tested without a browser, and the four adaptation modes (direct, follow the original frame,
auto adapt, custom) size against **the frame being replaced** — never against the header, whose
1080x1920 on a real device is smaller than the 1440x3168 frames it actually shows.

The formats themselves are a table (`src/core/logo/formats.ts`): the OPPO/Qualcomm container is the
one implemented and verified against a real partition, and a second vendor's container becomes a new
entry plus its own parser rather than a rewrite of the tool. Exporting uses the project's own zip
writer (`src/core/image/zip-write.ts`, stored entries, fixed timestamps so the archive is
reproducible), which the system `unzip` reads back entry for entry.

A second container is in that table already: MediaTek's logo.img, which is a 512 byte header (with a
logo magic at offset 8) followed by a block table and one zlib stream per block, each holding raw
pixels — 2 bytes per pixel is RGB565 with red in the low five bits, 3 bytes is BGR, 4 bytes is BGRA,
with a row stride that may be aligned and an optional prefix. None of that is recorded, so a block's
layout is inferred from its length and the screen resolution, which the container does not carry
either: the tool asks for it, suggests the sizes the biggest block could be, and the preview decides.
Blocks whose length the resolution does not explain, typically small icons, are left alone. The
structure came from two independent implementations — YetAnotherMediaTekLogoPatcher (MIT,
utils/binary.py:6,23,35,39,48,52,60 and utils/images.py:36,47,51) and mtk-tools (Apache-2.0) — and was
checked against a real 2.8 MB Xiaomi image: parsing it, decoding its largest block to the actual boot
screen, and rebuilding it byte for byte with nothing replaced. See .research/mtk-logo/NOTES.md.

Repacking follows the rule the rest of the project uses: the packer starts from the image's own bytes
and writes only the metadata entries and the frame streams, so a repack of an unmodified image is
byte for byte the input (verified against a real 15 MB partition, frames included), a replaced frame
leaves every other frame's stored stream untouched, and the result keeps the original file size
unless the new frames need more room.

bzip2 streams come out of OTA payloads (`REPLACE_BZ`), and a hand written decoder disagreed with one
of them, so the reference implementation decodes them: `public/wasm/bzip2.wasm` is bzip2 1.0.8
compiled by `scripts/build-bzip2-wasm.sh`, the same pattern as `lz4.wasm`, and its output was
checked digest for digest against `bunzip2`.

## Writing sparse images

An extracted partition can be rewritten as an Android sparse image (src/core/partition/sparse-write.ts).
The chunking is AOSP's: a block whose bytes are all the same, zero or not, becomes one fill chunk, runs
of them with the same value merge, and everything else becomes raw chunks that merge while they are
adjacent. That is deliberately narrow, because it makes the writer checkable: the tests compare its
output with the real img2simg byte for byte on crafted inputs and on a 15 MB partition from an OTA, and
feed its output back through simg2img, whose result is byte for byte the original partition.

Two things it does not do on purpose. It never emits a dont-care chunk, which means "leave whatever is
already on the device" and is a different statement from "this region is zero" — AOSP's writer does not
use one either, and a wrong one can leave stale bytes behind on a device. And it writes the image as a
stream, so the result is kept as a blob rather than a buffer, which is what makes a three gigabyte
partition packable at all.

## Writing super images

Packaging partitions into a super image (src/core/partition/super-write.ts) writes what AOSP's lpmake
writes: 4096 bytes of reserved space, the geometry and its backup at 0x1000 and 0x2000, the metadata
for each slot and its backup from 0x3000 on, and the partitions from the first logical sector, aligned,
with the geometry's and the header's SHA-256 checksums computed over exactly the ranges AOSP computes
them over — the 52 byte geometry struct, and the header up to the header_size field it declares.

The same writer also produces the compact form, which AOSP's tooling calls a super_empty image: when
it is given partition sizes without images, lpmake writes the 52 byte geometry struct at offset 0,
zeros up to 4096, and one copy of the header and its tables — 4096 + 128 + 312 bytes for two partitions,
and nothing else. The metadata inside still describes the whole device, which is the point: fastboot
takes that file and the partitions are created from it. This project's writer matches it byte for byte
too, which the tests check against the tool.

That last detail was one of two bugs the lpmake oracle found here. The reader in lp.ts had been written
against a fixture this project made, and the fixture was too forgiving: it wrote the geometry at offset
0 as well as at LP_PARTITION_RESERVED_BYTES, and it wrote 256 byte headers. So the reader looked for the
geometry at offset 0 and hashed a fixed 256 bytes of header, and every test passed — until a real
lpmake image was put through it. Both are fixed, and the fixture now puts things exactly where AOSP puts
them. The lesson is worth keeping: a self-made fixture can hide a layout bug for months, and a reference
implementation is what exposes it.

## Reference implementations first

Every byte level format in this project was implemented against a reference rather than against
recollection, and the order matters:

1. Find the reference implementation, read it, and cite it (file:line) in the code that depends on it.
   AOSP's liblp and libsparse, magiskboot, the Linux ext4 and erofs sources, the LZ4 and bzip2 trees.
2. If the reference is small enough to run, compile it to WebAssembly and use it directly: the lz4 and
   bzip2 codecs in public/wasm are the reference C, built by the scripts of the same name, so the
   decompressor is the reference by construction.
3. If a mature tool can produce or read the format, treat it as an oracle and compare byte for byte:
   img2simg and simg2img for sparse images, lpmake, lpdump and lpunpack for super images, bunzip2 for
   bzip2 streams. Where the oracle exists, the tests pin its output and this project's writer to the
   same digest.
4. When a byte differs, stop and find out which field it is instead of adjusting anything. Every one of
   these was found that way: the 8088 byte gap that was the geometry block being 52 bytes instead of
   4096; the geometry checksum covering the struct rather than the block; the block device entry's size
   and name being written in the wrong order; a header checksum hashed over 256 bytes instead of the
   128 the header declares.

Two lessons are worth more than the formats themselves. A fixture this project makes can hide a layout
bug for months: the super reader here looked for the geometry at offset 0 and hashed a fixed 256 byte
header, and its own fixture wrote both of those things, so every test passed until an lpmake image went
through it. Fixtures therefore mirror the reference layout exactly, and at least one test has to cross
the boundary — our writer read by their reader, and theirs by ours.

## Boot animations

A boot animation is a zip archive of desc.txt and part directories, and the format is documented by AOSP
itself (frameworks/base/cmds/bootanimation/FORMAT.md, kept in .research/upstream/aosp/): a first line of
WIDTH HEIGHT FPS, then rows of TYPE COUNT PAUSE PATH, where COUNT is how many times to play a part (0
loops until boot finishes) and PAUSE is a number of frames.

The parser here is deliberately more forgiving than that document, because a real vendor file demanded
it. The device this project reads ships a line the document does not describe at all, g WIDTH HEIGHT
OFFSETX OFFSETY FPS, and its desc.txt has comments and trailing spaces. So every line is kept exactly as
it was read and is only rewritten when one of its fields is actually changed: an untouched animation
comes back byte for byte, and an edited one keeps its dialect — change the frame rate of that vendor
file and the g line is what changes, not a first line the device's parser may not expect.

Writing follows the document's own convention, zip -0, which is what this project's zip writer does
anyway: entries are stored, never compressed, with desc.txt first. One honest difference: the vendor
archive of that device deflates some of its entries, so a repack stores them instead. The contents are
identical either way, the system reads both, and storing is what the document asks for.

The tool page (src/routes/BootAnimationPage.tsx) plays the animation on a canvas at the frame rate
desc.txt declares, shows a window of a part's frames with the replaced ones marked, and sends the desc
text plus the replaced frames to the worker, which rebuilds the archive and reads the result back to
check that every entry the user did not touch kept its bytes. Nothing writes to a device: the output is
an archive to download.

Artifacts are sources too. A file read out of a filesystem image is kept as an artifact, and an
artifact can be opened as a source of its own (openArtifactSource): that is what lets a tool take a zip
that lives inside a system image without a detour through the filesystem. It deliberately does not parse
the bytes as an image, because a boot animation is not one. One thing to know about the workspace: closing
a source takes every artifact derived from it, so an artifact has to be opened before its source is closed.

## Comparing images

The compare core (src/core/diff/) walks two sources in one megabyte chunks, merges runs of differing
bytes that are within 64 bytes of each other into one range, and stops *listing* ranges after 200 of
them while still counting every differing byte exactly — a file that differs everywhere would otherwise
produce millions of ranges. The run that extends past the shorter source is one more range.

When the source is a boot image the ranges are mapped onto its sections, which come from the header: the
header declares sizes and not offsets, so each section starts where the previous one ends, rounded up to
the page size. A real init_boot of this device, for one, is header 0..4096 and ramdisk 4096..2724822, so
a change inside the ramdisk is reported as exactly that and nothing else. Everything a named section does
not cover is reported as outside any section, which is where the padding and the tail of a partition dump
live.

## Hard rules

1. **Providers never parse boot images.** A provider receives the normalized object
   produced by the Image Engine (`ParsedImage` / `AndroidImage`). When an upstream tool
   has to touch a kernel image, the provider hands it the kernel section the Image Engine
   already extracted, and the Image Engine repacks the container afterwards.
2. **The React UI never decides compatibility.** Candidates come from the compatibility
   engine.
3. **Versions are never hardcoded in the UI.** They come from the artifact registry.
4. **Heavy work never runs on the main thread.** Parsing, patching, repacking and hashing
   run inside the Web Worker.
5. **The Mock Provider never pretends to be a real root solution.** It is labelled as a
   mock in the UI, in the produced metadata and inside the patched image.
6. **Bundled artifacts are digest verified before execution.** `loadVerifiedPayload`
   refuses bytes whose SHA-256 differs from the registry entry.

## Internationalization

The interface ships in English, Simplified Chinese, Traditional Chinese and Japanese. Each
language has one catalogue in `src/i18n/messages/`; the English one is the source of truth, its keys
are the `MessageKey` union, and the other catalogues are typed as `Messages`, so a language that
misses a message does not compile. The prose the engine produces is separate: `src/i18n/record/`
holds one table per language keyed by the English source string, gettext style, and is used for
display only.

Two kinds of string stay English on purpose, for the same reason: **a plan is the record of a run**.
A plan pins provider, release, artifact, architecture, target, header version and configuration, and
its id is a hash over exactly those fields, so changing the interface language must not change a
plan or its id. Engine prose that can end up in a plan (stage labels, provider notes) therefore
stays English in the plan, and the interface translates what it displays. Verdicts the interface has
to word itself are reported as stable codes with parameters instead of sentences: compatibility
reasons (`reasonDetails[].code`), compatibility warnings and verification checks (`checks[].id`)
are matched against the tables in `src/i18n/engine-keys.ts`, and a code without a message falls
back to the English sentence the engine sent rather than showing nothing.

`tests/unit/i18n.test.ts` checks the catalogues (key parity, no empty message, identical
placeholders, a language that is actually translated) and `tests/unit/i18n-coverage.test.ts`
checks coverage in both directions: every report label, provider sentence, stage label and progress
line the engine can produce has a translation in every language, and every translation is tied to
prose that still exists in `src/core`.

## KernelSU (LKM) provider

    init_boot.img (or a boot.img with a ramdisk)
      -> Image Engine extracts the ramdisk section
      -> decompress (LZ4 legacy / LZ4 frame / gzip / xz) -> CPIO newc
      -> checks: not already Magisk patched, module pinned by the plan, module declares name=kernelsu,
         module vermagic matches the kernel version implied by the KMI
      -> init -> init.real, add init (ksuinit, 0755), add kernelsu.ko (0755), optional ksu_config
      -> serialise CPIO in ksud's canonical layout -> recompress in the original container
      -> Image Engine repacks the image
      -> verification reads the produced ramdisk back and requires init and kernelsu.ko to be there

The KMI decides which module is loadable (GKI keeps the module ABI stable within one). It is read
from the kernel banner when the image carries a kernel, and has to be selected for `init_boot.img`,
which carries none; a selection that contradicts the banner is refused rather than trusted.

The archive is written in the layout ksud uses, through `canonicalizeCpio`: entries sorted by
name, one per name, inodes renumbered from 300000 and nothing after the trailer. That is what makes
the produced ramdisk section byte for byte the one KernelSU's own app writes, which the real-material
test asserts.

One module per KMI is bundled and used by default, and a module supplied by the user overrides it.
The modules come from KernelSU's `kernel/` directory, which is GPL-2.0-only, so they are
redistributed the way KernelSU itself redistributes them: as separate, unmodified programs under
their own licence, never linked into this AGPL-3.0-or-later project (`THIRD_PARTY_LICENSES/kernelsu/`).
Whichever module is used, the provider reads its `.modinfo` and checks the kernel version it was
built for against the KMI, and the result records its name, licence and vermagic.

## Magisk provider

    init_boot.img (or a boot.img with a ramdisk)
      -> Image Engine extracts the ramdisk section
      -> decompress (LZ4 legacy / LZ4 frame / gzip / xz) -> CPIO newc
      -> checks: not already Magisk or KernelSU patched
      -> fstab entries: the verity and encryption flag strings are removed exactly as magiskboot
         removes them, and verity_key is dropped when verity is not kept
      -> init -> magiskinit (0750), overlay.d/ and overlay.d/sbin (0750) with magisk.xz, stub.xz and
         init-ld.xz (0644), .backup/.magisk (000) with the configuration, the stock init as
         .backup/init.xz (0750) and the added paths as .backup/.rmlist (000)
      -> serialise CPIO -> recompress in the original container -> Image Engine repacks the image
      -> verification reads the produced ramdisk back and requires the payloads and the config

The three payloads are bundled **uncompressed** — exactly the files Magisk's own patcher feeds to
`magiskboot compress=xz` — and ImageForge compresses them at patch time with the same codec
(`lzma-rust2`, CRC32, the crate magiskboot links — 0.16.2 there, 0.21.0 here; this project's search
preset is smaller than magiskboot's, and the declared dictionary is rewritten to the reference one)
and the declared dictionary as the official streams
(64 MiB, see `src/core/image/xz.ts`), so the produced streams are byte for byte the ones the app
writes. The stock init is compressed the same way.

Two further details decide whether the output matches the app rather than merely booting:

* **The archive layout.** Magisk's patcher writes its ramdisk through a `BTreeMap`
  (`native/src/boot/cpio.rs:269`, `Cpio::dump`), so the entries come out sorted by name, a repeated
  name collapses into one entry, inodes are renumbered from 300000 with `nlink` 1 and `mtime` 0, and
  nothing follows the trailer. `canonicalizeCpio` (`src/core/image/cpio.ts`) reproduces that, and the
  Magisk provider calls it before encoding. The ramdisk layer itself stays byte-exact for untouched
  archives: normalising is the provider's decision, taken because it is reproducing this patcher.
* **The container codec.** LZ4 blocks are compressed by upstream liblz4 (see the WASM table below).

`tests/integration/magisk.test.ts` verifies the whole ramdisk section against an image the official
app produced from the same source image: same length, same SHA-256, byte for byte.

## Ramdisk layer

Android ramdisks are CPIO `newc` archives, usually inside a gzip or LZ4 container:

    ramdisk section -> decompress (LZ4 legacy / LZ4 frame / gzip / xz) -> CPIO newc -> entries
                    -> edit entries -> serialise CPIO -> recompress in the same container

Everything a producer wrote is preserved, including the padding after a name, the padding after a
payload, the trailer entry fields (producers disagree about them) and any bytes after the trailer,
so `serializeCpio(parseCpio(bytes))` returns the original bytes. That is the acceptance criterion
enforced by `tests/integration/ramdisk.test.ts` against a real device `init_boot` image: any
provider that wants to touch a ramdisk builds on a layer that is already proven to be lossless.

Re-encoding a ramdisk uses our own compressor, so the container bytes differ from the original
even when the payload is unchanged (on a 2.7 MB LZ4 legacy ramdisk the output is about 12% larger).
The payload is identical, which is what a bootloader parses; shrinking that difference is a
possible later improvement.

## Image Engine

| Stage | Implementation |
| --- | --- |
| Parse | boot header v0-v4, vendor boot header v3-v4 |
| Extract | kernel, ramdisk, second, recovery_dtbo, dtb, bootconfig, signature, vendor ramdisk table |
| Analyze | kernel architecture heuristics, compression detection, OS version decoding |
| Transform | cmdline, name, kernel, ramdisk, dtb and bootconfig replacement |
| Repack | page aligned rebuild, `recovery_dtbo_offset` fixup, AVB signature drop policy |
| Verify | re-parse, bounds checks, per-section SHA-256, expectation matching |

Real images shaped two decisions:

* On v4 images an AVB vbmeta blob can follow the kernel while `signature_size` is 0. It is
  reported as a signature region, never as bootconfig, and it is dropped on repack.
* The kernel payload is handed to providers as raw section bytes together with its detected
  compression, so a provider can refuse an unsupported format instead of corrupting it.

Compression support: gzip is expanded through `DecompressionStream`; LZ4 legacy and LZ4 frame
payloads are expanded by the Rust WebAssembly codec, which keeps a 64 KiB window so frames with
dependent blocks decode correctly; xz goes through the same module, which holds an LZMA2 codec built
from the crate magiskboot uses.

LZ4 *compression* is not a reimplementation: `public/wasm/lz4.wasm` is upstream liblz4 1.10.0,
compiled from the pinned tarball by `scripts/build-lz4-wasm.sh` — the revision magiskboot links
(`lz4-sys 1.11.1+lz4-1.10.0` in Magisk v30.7) and the one the stock tools used. Blocks are
compressed at `LZ4HC_CLEVEL_MAX` (12), exactly what `magiskboot` passes, so a device ramdisk
re-encodes to the bytes the stock image shipped, byte for byte (`tests/unit/lz4.test.ts`). The hand
written encoder in the Rust module stays as the fallback for environments where the reference module
cannot be loaded; it produces valid but about 3% larger blocks. Level 12 is the slow setting: a
5 MB `init_boot` ramdisk takes about 0.4 s, while the 63 MB vendor ramdisk of a device image takes
about 13 s inside the patch worker (the same setting costs the official patchers the same work). LZMA, BZip2 and Zstandard are detected and
reported but cannot be expanded. "unknown" means no container magic matched, which is
what a plain arm64 `Image` looks like, so those payloads are passed through unchanged.

When a provider has to rewrite a compressed section, `describeCompression` captures the
container settings (block size, block and content checksums, content size, dictionary id)
and `compressSection` writes the payload back into the same container using our LZ4 block
compressor and XXH32. Without that step the bootloader would try to decompress an
uncompressed payload.

Vendor boot images are parsed and repacked: the platform ramdisk fragment is replaced and the
layout is recomputed by the parser's own rule (page aligned ramdisk, then dtb, table and bootconfig),
so every other section ends up where it started.

## Lazy loading

Describing a provider is data, running one is code, and the two travel separately:

* `src/core/patch/providers/descriptors.ts` holds the name, description, supported formats and
  status of every provider. The compatibility engine and the UI read only those, so listing the
  candidates never imports a patch pipeline.
* `src/core/patch/providers/registry.ts` imports an implementation with `import()` the first time
  that provider is actually used (`PROVIDER_LOADERS`). Every `PatchProvider` method is
  asynchronous, so a `LazyPatchProvider` can stand in for the real object: it reports the
  descriptor's name, forwards the first call and shares one import between concurrent callers. A
  failed import is not cached, so it can be retried.
* Constants a caller can legitimately need without running anything (plan configuration keys, entry
  names, the registered KernelPatch flavours, the Magisk config builder) live in `*-config.ts`
  next to the implementation, and the `src/core` barrel re-exports those instead of the classes.
* The inline worker session — the fallback used when `Worker` is unavailable — is imported on demand
  too, so a browser that has a Worker does not carry the Image Engine on the main thread.
* `package.json` declares the app side-effect free except for CSS, which lets the bundler drop the
  `src/core` re-exports a page never touches.
* Messages follow the same rule as providers. English (`messages/en.ts`) is bundled because it is
  the source of truth, the `MessageKey` union and the fallback; the other three languages — the
  interface catalogue and the engine prose table together — are imported when one is selected
  (`src/i18n/catalog.ts`). Until the selected catalogue arrives the interface keeps the language it
  already had, and `<html lang>` is set from the stored preference by the inline script in
  `index.html`, so the document never claims the wrong language.

Effect on the production build (measured, the numbers are machine specific): the first load went
from about 725 kB of JavaScript to about 470 kB. The Image Engine and the four providers left the
initial graph, and each provider became its own chunk — `apatch` 36 kB, `kernelsu` 12 kB,
`magisk` 10 kB, `mock` 5 kB — fetched when a plan or a patch first needs them. The shared UI chunk
went from 180 kB to 63 kB because the three non-English catalogues (about 18-24 kB each) became
chunks of their own. The worker builds its own copies of the provider chunks, which is how Vite
bundles a worker entry; the page only downloads what it imports.

The icon set was already on demand and needed no change: a lucide icon is its own module, and the
production source maps show exactly the thirty icons the app imports plus thirteen runtime helpers
(`createLucideIcon`, `Icon`, the name converters) — no unused icon is in any chunk.

## Patch providers

| Provider | Target | Mechanism |
| --- | --- | --- |
| `apatch` | `boot.img` only | KernelPatch core image injected into the kernel by the upstream kptools build in WebAssembly. Three core images are registered as artifacts (upstream, the Aster fork and the branch FolkPatch ships); each only trusts its own manager app, so the plan records `kernelPatchFlavor` and `requiredManager`. A run can also carry its own core image (`kernelPatchFlavor: custom`), which is checked for the KernelPatch magic before kptools sees it |
| `kernelsu` | `boot.img`, `init_boot.img`, `vendor_boot.img` | The KernelSU family: a wrapper replaces the ramdisk init and a loadable module is added next to it. Five managers are registered as flavours (KernelSU, SukiSU, ReSukiSU, YukiSU and KowSU) because each one's module is compiled against its own manager certificate, so the plan records `kernelsuManager`, the module artifact it carries and `requiredManager`. YukiSU's flavour also writes that manager's early boot settings into the module itself |
| `magisk` | `boot.img`, `init_boot.img`, `vendor_boot.img` | magiskinit replaces the ramdisk init, the manager's payloads are written under `overlay.d/sbin`, its configuration goes to `.backup/.magisk`, and the stock init is kept as `.backup/init.xz`. Three flavours are registered (Magisk, and the WeaveMask and MagisKube forks, whose patchers are byte for byte Magisk v30.7's) because each build of magiskinit only trusts its own app; the plan records `magiskFlavor` and `requiredManager` |
| `mock` | `boot.img`, `init_boot.img` | Rewrites the kernel cmdline and a bootconfig manifest |

All four are implemented; the two ramdisk providers are described above.

### APatch pipeline

    boot.img
      -> Image Engine parses and extracts the kernel section
      -> compatibility engine checks boot-only, arm64, kernel present, compression supported
      -> provider preflight runs "kptools -f" and requires CONFIG_KALLSYMS=y
      -> provider runs "kptools -p -i kernel -k kpimg -o kernel.patched" (no -S by default)
      -> optional: one "-M <module> -N <module> -T kpm" group per attached KernelPatch module
      -> provider confirms with "kptools -l -i kernel.patched" that patched=true and that the
         reported module count matches the attachments
      -> Image Engine repacks boot.img with the patched kernel and drops the AVB signature
      -> verifier re-parses the output and compares the kernel digest with the plan

Binary payloads such as KernelPatch modules travel as `PatchAttachment` entries on the run
context, never through the plan: the plan records only the file names, and the provider
refuses an attachment the plan does not pin.

The superkey is optional. When it is absent (the default, matching the APatch manager where
authentication is signature based) no `-S` argument is passed. When it is set, kptools stores
the SHA-256 of the key in the kernel's `root_superkey` field, which the kernel uses to
bootstrap the runtime superkey, so the key can be rotated later. The raw key never enters the
plan: it travels through `PatchRunContext.options`, the provider strips it from the plan
configuration, and only the mode is recorded.

Device images are usually whole-partition dumps, so the repacked image is compact by
default: partition padding and the AVB blob are not part of a boot image. When the plan
configuration asks for `preserveImageSize`, a provider passes `padTo: image.totalSize` to
`repackBootImage`, which zero pads the output and reports the padding as a warning. The
layout of the image itself is unchanged, and the AVB signature is dropped either way.

## What a run checks before it hands you an image

Verification is part of the pipeline, not a claim made afterwards. Before a produced image is offered
for download:

* the output is re-parsed — magic, header version, section bounds, page alignment;
* the ramdisk's SHA-256 is compared with the one the plan recorded, when it records one;
* the cmdline and the bootconfig markers the plan requires are present;
* the produced bytes are hashed and compared with the digest the provider reports for them;
* the artifact that was loaded is re-checked against the registry, and bundled payloads are fetched
  **content addressed** (`?v=` plus the first 16 hex characters of their digest), so a stale cache
  entry whose content no longer matches the record cannot be served under the current URL.

A failed check stops the run rather than producing a file with a warning next to it. The one thing
the pipeline does not decide for you is the flashing: see the checklist on the result page.

## WASM

| Module | Purpose |
| --- | --- |
| `public/wasm/imageforge.wasm` | Rust crate: CRC32, LZ4 block decoding (windowed) and LZ4 block compression, with an identical TypeScript fallback |
| `public/wasm/kptools.wasm` | Upstream KernelPatch kptools compiled to `wasm32-wasip1` |
| `public/wasm/lz4.wasm` | Upstream liblz4 1.10.0 (BSD-2-Clause) compiled to `wasm32-wasip1` in reactor mode: the reference block codec, so container bytes match the official patchers |
| `public/wasm/bzip2.wasm` | Upstream bzip2 1.0.8's decompressor plus a small shim, compiled to `wasm32-wasip1`: real OTA payloads store partitions as `REPLACE_BZ` blobs |

Every module in that table is digest verified before it is instantiated, and none of them is
streamed: the bytes are read first so the digest can be seen, and a module is a fifth of a megabyte.
The ones the WebAssembly layer fetches itself are registered in `src/wasm/assets.ts` with the
register in `THIRD_PARTY_LICENSES/` that documents the same path; `kptools.wasm` is registered in
the artifact catalog because a provider compiles it, and a mismatch there refuses the run. For the
codecs a mismatch is not fatal — they have fallbacks — but it is not silent either: the loader
reports why the module is not in use.

`kptools.wasm` is driven by `src/wasm/wasi-runner.ts` on top of
`@bjorn3/browser_wasi_shim`, which provides an in-memory file system. Upstream sources are
never modified: the build adds a separate compatibility file for two wasi-libc gaps and
copies `preset.h` into its own include directory. See
`third_party/kptools-wasm/README.md`.

Node's native `node:wasi` implementation crashes with SIGSEGV on this module's kallsyms
path, so tests and production both use the JavaScript shim.

## Reproducible patch plans

A plan pins provider, release, artifact id, artifact SHA-256, architecture, target image,
boot header version and configuration. The plan id is the leading 32 hex characters of the
SHA-256 over the canonicalised plan fields, excluding timestamps. The APatch provider
declares reproducibility only because the test suite checks that patching the same image
twice yields identical kernel bytes.

## Worker protocol

`PatchWorkerSession` implements the RPC surface and keeps the parsed image inside the
worker so image bytes are never resent:

    version()  -> string
    analyze(file: ArrayBuffer, name?) -> AnalyzeResponse
    plan({ providerId, options? })    -> PlanResponse
    patch({ providerId, options? }, onProgress) -> PatchResponse (bytes transferred back)
    cancel()   -> void
    reset()    -> void

When `Worker` is unavailable (tests, unsupported environments) the client falls back to an
inline session with the same interface.
