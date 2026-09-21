# kernelsu

Status: **only the userspace init wrapper is bundled**.

KernelSU splits its licence by directory (KernelSU README, "License"):

* everything under `kernel/` is **GPL-2.0-only**;
* everything else is **GPL-3.0-or-later**.

GPL-2.0-only cannot be combined with this project's AGPL-3.0-or-later licence, so the two
components are treated differently.

| Component | Release asset | Licence | Bundled |
| --- | --- | --- | --- |
| Init wrapper | `ksuinit-aarch64` | GPL-3.0-or-later | yes, digest verified |
| Loadable module | `lkm-aarch64-{kmi}_kernelsu.ko` | GPL-2.0-only | **no, supplied by the user** |

## Bundled: ksuinit

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/tiann/KernelSU |
| Pinned revision | `v3.3.0` (2026-08-28) |
| Release asset | `ksuinit-aarch64` |
| Retrieved on | 2026-09-22 |
| Bundled artifact | `public/artifacts/kernelsu/ksuinit`, 607360 bytes, sha256 `b49fff3252cdcd14bf80472becbd96c4f17028a632b364e8d455d335b94f1345` |
| Description | "ELF 64-bit LSB executable, ARM aarch64, statically linked, for Android 26, built by NDK r29, stripped" |
| License | GPL-3.0-or-later, see LICENSE in this directory |
| Local modifications | none (redistributed byte for byte) |

It is added to the ramdisk as `init` (mode 0755) after the original `init` has been renamed to
`init.real`; at boot it loads the module and hands over to `init.real`.

## Not bundled: the loadable module

`lkm-aarch64-{kmi}_kernelsu.ko` is built from KernelSU's `kernel/` directory, which is
GPL-2.0-only. The user downloads the module matching the device KMI from the KernelSU release and
attaches it in the patch page. ImageForge verifies it before use (a relocatable aarch64 ELF whose
`.modinfo` says `name=kernelsu`) and reports the fields it declares, so the licence of what ends
up inside the produced image is visible in the result.

Published KMIs in `v3.3.0`: android12-5.10, android13-5.10, android13-5.15, android14-5.15,
android14-6.1, android15-6.6, android16-6.12, android17-6.18 (aarch64 and x86_64).

A module built for one kernel version still loads on another version of the same KMI: when the
kernel has symbol CRCs (`modversions`), Linux compares only the part of `vermagic` after the
first space, so `6.6.127-4k-... SMP preempt mod_unload modversions aarch64` matches a
`6.6.118-android15` GKI kernel. That is why KernelSU publishes per KMI rather than per kernel
version.

The KernelSU manager app (`me.weishu.kernelsu`) has to be installed on the device for the
produced image to be usable.
