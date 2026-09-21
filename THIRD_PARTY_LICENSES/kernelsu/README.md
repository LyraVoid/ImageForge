# kernelsu

Status: **two separately licensed components are bundled.**

KernelSU splits its licence by directory (KernelSU README, "License"):

* everything under `kernel/` is **GPL-2.0-only** — see `LICENSE-GPL-2.0`;
* everything else is **GPL-3.0-or-later** — see `LICENSE`.

This project is AGPL-3.0-or-later, and GPL-2.0-only cannot be combined with it. The components are
therefore distributed the way KernelSU itself distributes them: as **separate programs**, each
under its own licence, each unmodified, with the matching source named below. Nothing is linked
into ImageForge: the module is data that is written into a boot image and loaded by the
(GPL-2.0) Linux kernel, and the init wrapper is a file the ramdisk runs.

| Component | Release asset | Licence | Bundled |
| --- | --- | --- | --- |
| Init wrapper | `ksuinit-aarch64` | GPL-3.0-or-later | yes, unmodified |
| Loadable module, one per KMI | `lkm-aarch64-{kmi}_kernelsu.ko` | GPL-2.0-only | yes, unmodified |

## Correspondence

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/tiann/KernelSU |
| Pinned revision | tag `v3.3.0` (released 2026-08-28) |
| Source for the bundled binaries | the release assets of that tag, byte for byte |
| Retrieved on | 2026-09-22 |
| Local modifications | none |
| Exact digests | `src/core/artifacts/catalog.ts`, release `v3.3.0` of provider `kernelsu` |

Bundled artifacts:

* `public/artifacts/kernelsu/ksuinit` — 607360 bytes, sha256
  `b49fff3252cdcd14bf80472becbd96c4f17028a632b364e8d455d335b94f1345`
* `public/artifacts/kernelsu/lkm-aarch64-{kmi}_kernelsu.ko` for
  `android12-5.10`, `android13-5.10`, `android13-5.15`, `android14-5.15`, `android14-6.1`,
  `android15-6.6`, `android16-6.12` and `android17-6.18` (aarch64 only; the x86_64 modules of the
  same release are not bundled because every provider here targets arm64).

## How the two are used

The wrapper is written to the ramdisk as `init` (mode 0755) after the original `init` is renamed
to `init.real`; at boot it loads the module and hands over to `init.real`. The module for the
device KMI is written to the ramdisk as `kernelsu.ko` (mode 0755). A module supplied by the user
overrides the bundled one, and either way ImageForge reads its `.modinfo` and checks that the
kernel version it was built for matches the selected KMI before writing anything.

A module built for one kernel version still loads on another version of the same KMI: when the
kernel has symbol CRCs (`modversions`), Linux compares only the part of `vermagic` after the first
space, so `6.6.127-4k-... SMP preempt mod_unload modversions aarch64` matches a
`6.6.118-android15` GKI kernel. That is why KernelSU publishes per KMI rather than per kernel
version.

The KernelSU manager app (`me.weishu.kernelsu`) has to be installed on the device for the
produced image to be usable.
