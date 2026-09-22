# Using ImageForge

ImageForge analyzes, patches, repacks and verifies Android boot images **in your browser**. It
never uploads an image, it has no backend and no account, and it **never writes to a device**: the
pipeline ends at a downloaded image, and what happens after that is your decision.

Everything below that talks about `adb`, `payload.bin` or flashing is a step **you take with your
own tools**. ImageForge has no ADB, no fastboot and no USB access by design.

## 1. Get the image you want to patch

You need one of these, for the exact build that is running on the device:

| File | What is inside | Used by |
| --- | --- | --- |
| `boot.img` | the kernel, and on older devices the ramdisk | APatch (kernel), KernelSU and Magisk (ramdisk, pre-GKI) |
| `init_boot.img` | the generic ramdisk only (GKI, Android 13+) | KernelSU and Magisk |
| `vendor_boot.img` | the vendor ramdisk fragment, the dtb and the bootconfig | KernelSU and Magisk |

Ways to get one:

* **Dump it from the device you are patching** (root or an unlocked bootloader, using your own
  tools). Take the partition the file belongs to, for example
  `dd if=/dev/block/by-name/init_boot of=/sdcard/init_boot.img` from a root shell, then pull it.
* **Take it from your device's factory image or OTA** and extract the partition you need from
  `payload.bin` or from the vendor's image archive.

Keep a stock copy of the file you are about to patch somewhere safe. Restoring a device means
writing that image back, and ImageForge cannot reconstruct it for you.

## 2. Choose a patch method

The analysis page lists the methods compatible with the image you loaded, and says why the others
are not. Only files that are actually implemented appear as `available`.

| Method | Target | Needs | Manager app |
| --- | --- | --- | --- |
| **APatch** | `boot.img` only | `CONFIG_KALLSYMS=y` in the kernel; uncompressed, gzip, LZ4 or xz kernel | `me.bmax.apatch`, or `me.yuki.aster` for the Aster flavour, or whatever a hand-supplied core image was built for |
| **KernelSU** | `init_boot.img`, or a `boot.img`/`vendor_boot.img` with a ramdisk | the KMI of the device (read from the kernel when the image has one, otherwise selected) | `me.weishu.kernelsu` |
| **Magisk** | `init_boot.img`, or a `boot.img`/`vendor_boot.img` with a ramdisk | nothing beyond the image | `com.topjohnwu.magisk` |
| **Mock** | `boot.img`, `init_boot.img` | nothing | none: it is a pipeline demonstration, not a root solution |

Find the KMI from the kernel banner if the image carries a kernel:

    uname -r          # 6.6.118-android15-... means the KMI is android15-6.6

A module that does not match the KMI will not load and the device may not boot, which is why a
selection that contradicts the image's own kernel banner is refused instead of trusted.

## 3. Read the patch plan

The patch page shows what the run will carry:

* **provider, release, artifact and digest** — pinned so the same plan can be reproduced later;
* **target image and boot header version** — what will be written back;
* **configuration** — the options below;
* **pipeline** — the stages the worker runs.

Options worth knowing:

* **Preserve the original image size** — device images are usually whole-partition dumps. By
  default the output is the compact boot image (what `mkbootimg` and Magisk also produce). Turn
  this on when a tool on your side expects a partition-sized file.
* **Keep the original AVB bytes** — the official patchers keep the signature area of the source
  image. Those bytes are invalid after any patch, so verified boot fails either way; turning this
  off leaves the area empty instead.
* **Root credentials (superkey)** — APatch only, optional and unset by default, matching the
  manager default where authentication is by signature. When you set one, only its SHA-256 is
  written into the kernel; the key itself never enters the plan, the metadata or the image. Keep it:
  it is what authenticates an authorised client.
* **KernelPatch modules (KPM)** — optional. The plan records the file names, the bytes travel with
  the run only, and a module is checked before it is embedded. Their licences are your
  responsibility.
* **Custom core image (kpimg)** — attach your own KernelPatch core image; it must start with the
  KernelPatch magic, and the result reports the digest and the version kptools read from it.
* **Module override (KernelSU)** — attach `{kmi}_kernelsu.ko` to override the module this build
  ships. Its `.modinfo` and the kernel version it was built for are checked before it is written.

## 4. Patch, verify, and read the checklist

Patching and verification run inside a Web Worker in your browser. When it finishes, the result
page shows:

* every verification check (structure, format, header version, hashes, markers), and
* **the checklist for writing the image to a device**: the target partition, the manager app the
  image needs, what the dropped AVB signature means, which part of the image changed, the image
  size, the plan id, and a reminder to keep a stock image.

The plan id is the leading 32 hex characters of a SHA-256 over the pinned plan fields. Two runs of
the same image with the same plan produce the same output bytes for the providers whose tests
enforce it (APatch and the Mock Provider; the ramdisk providers are reproducible for a pinned
artifact and module).

If something goes wrong, **Export diagnostics** writes a JSON report with the image facts, the
plan, the metadata and the verification result. It contains no image bytes and no secret, so it is
safe to attach to a bug report.

## 5. Writing it to the device is your step

ImageForge deliberately stops at the downloaded image. When you write it:

* write it to **the same partition you read it from** (the result page names it);
* keep the stock image, an unlocked bootloader is not a substitute for a way back;
* the AVB signature is stale or dropped, so **verified boot fails** unless you re-sign the image or
  disable verification;
* install the manager app the checklist names; without it the patched image does not give you a
  usable root manager.

## 6. Going back

Write the stock image back to the partition. Magisk's own patcher can also restore itself from the
`.backup/init.xz` copy it keeps inside the ramdisk, but a stock image is the reliable way back.
ImageForge reports which patch programs it found in an image when it analyses one, so you can see
what you are about to stack on top of.

## Troubleshooting

| What you see | What it means |
| --- | --- |
| "This patch method is not compatible with the selected image." | The candidate list explains why per method (format, header version, architecture, missing kernel or ramdisk, no artifact release). |
| "This kernel does not enable CONFIG_KALLSYMS, which KernelPatch requires." | APatch cannot work on that kernel; KernelSU or Magisk on the ramdisk is the alternative. |
| "This build cannot expand that kernel compression" | LZMA, BZip2 and Zstandard payloads are detected but cannot be re-compressed; unpack and repack the kernel with a stock tool first. |
| A KMI conflict message | The selected KMI contradicts the kernel banner of the image. The banner wins. |
| "This ramdisk looks like it was already modified by another tool." | The ramdisk already carries another root solution; restore a stock image before stacking a second one. |
| A verification check failed | Read the check's detail, export diagnostics, and do not use the image. |

## Languages and privacy

The interface ships in English, Simplified Chinese, Traditional Chinese and Japanese (header and
Settings). The **record** of a run — the plan, the metadata, the artifact names — stays in English
on purpose: a plan id is a hash over the pinned fields, so the language must not change it.

Nothing is uploaded: images are read from your file system into the page, processed in a Web Worker
with WebAssembly, and handed back as a download. Bundled third-party binaries are digest verified
before use and listed in [THIRD_PARTY_LICENSES/](../THIRD_PARTY_LICENSES/README.md).
