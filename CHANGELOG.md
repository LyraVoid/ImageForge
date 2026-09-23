# Changelog

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
