# kernelsu

Status: **two separately licensed components are bundled, for five managers of the family.**

KernelSU started a family of managers: forks that keep its injection algorithm (a wrapper replaces
`init`, a module is added next to it) and rebuild both payloads against their own signing certificate.
A module is compiled with the expected manager certificate baked in, so one manager's module cannot be
used with another's app; that is why each manager gets its own release in the registry and its own
flavour in the interface, and why this record has one section per manager.

| Manager | Repository | Pinned | Manager package | Payloads come from |
| --- | --- | --- | --- | --- |
| KernelSU | https://github.com/tiann/KernelSU | tag `v3.3.0` | `me.weishu.kernelsu` | release assets |
| SukiSU | https://github.com/SukiSU-Ultra/SukiSU-Ultra | tag `v4.2.0` | `com.sukisu.ultra` | release assets (`ksuinit-aarch64.zip`, `aarch64-{kmi}-lkm.zip`) |
| ReSukiSU | https://github.com/ReSukiSU/ReSukiSU | tag `v4.2.0-rc3` | `com.resukisu.resukisu` | recovered from its APK: see "Payloads that are only inside an APK" |
| YukiSU | https://github.com/Rouyashiki/YukiSU | tag `v1.7.0` | `com.anatdx.yukisu` | modules are release assets; the wrapper is recovered from its APK |
| KowSU | https://github.com/zaominn/KowSU (built from `KOWX712/KernelSU`) | tag `manager-build-32737` | `com.kowx712.supermanager` | recovered from its APK |

Every manager's kernel directory is GPL-2.0-only and everything else is GPL-3.0-or-later, exactly like
upstream, so the split described below applies to all five.

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

## Per-manager record

The wrapper of each manager, with its size and digest; the eight modules per manager are listed with
their digests in `src/core/artifacts/catalog.ts`, one release per manager of the `kernelsu` provider.

| Manager | Wrapper | Size | SHA-256 |
| --- | --- | --- | --- |
| KernelSU | `public/artifacts/kernelsu/kernelsu/ksuinit` | 607360 | `b49fff3252cdcd14bf80472becbd96c4f17028a632b364e8d455d335b94f1345` |
| SukiSU | reuses the KernelSU wrapper (its own release publishes the same bytes) | 607360 | `b49fff3252cdcd14bf80472becbd96c4f17028a632b364e8d455d335b94f1345` |
| ReSukiSU | `public/artifacts/kernelsu/resukisu/ksuinit` | 611424 | `761afc0cac6ad839685493246cb352fa70a51ac2898daad70d1e88bf394b6dde` |
| YukiSU | `public/artifacts/kernelsu/yukisu/ksuinit` | 309904 | `7df0b720ee7db30f1efe58d536c9675b1bd530d8f38904260ed580353995cc1e` |
| KowSU | `public/artifacts/kernelsu/kowsu/ksuinit` | 607552 | `7120b1702d01ab9e1bc6036a9de445c4ce9c44092c6fd30c76bec8de393273a8` |

What each manager's patcher does differently from upstream, read from its own source:

* **KernelSU** (`userspace/ksud/src/boot_patch.rs:714-760`): `init` → `init.real`, wrapper as `init`,
  module as `kernelsu.ko`, `ksu_config` with the run's configuration, and the legacy `allow_shell`
  entry removed.
* **SukiSU** (`userspace/ksud/src/boot_patch.rs:724-789`): the same, plus the `spoof_release` and
  `spoof_version` keys it accepts in `ksu_config` — which this build passes through, because the run's
  configuration is what is written.
* **ReSukiSU** (`userspace/ksud/src/boot_patch.rs:743-802`): the same, plus `bundled=1` when the
  module written is the one that came with the manager, and an optional `ksu_block_modules` file that
  this build does not offer (it is optional there too).
* **YukiSU** (`userspace/ksud/src/boot/boot_patch.cpp:1184-1237`): the same with `bundled=1`, and in
  addition it writes its early boot settings *into the module*: a 512 byte `ksu_imgpatch_config`
  (`uapi/imgpatch_config.h:13-36`) and a 40 byte SuperKey block. `src/core/patch/providers/
  kernelsu-module-config.ts` reproduces that, including the "signature only" SuperKey the manager
  writes when no SuperKey is configured, which is the only mode this build offers.
* **KowSU** (`userspace/ksud/src/boot_patch.rs:717-766`): the same as ReSukiSU without the block
  modules file. Its release also ships a second build of every module whose internal name is `ksu`
  (the `xx-` variant, selected by naming it); those are **not** bundled, because a module supplied by
  the user covers that case.

## Payloads that are only inside an APK

ReSukiSU, YukiSU and KowSU publish no separate payload files — their `libksud.so` embeds them
(`rust-embed` with `include-flate`, i.e. one raw DEFLATE stream per asset), so they were recovered
from the release APK with `scripts/scan-embedded-elf.py`, which finds the DEFLATE streams that inflate
to a whole ELF and prints each one's digest and `.modinfo`:

    unzip -o <release>.apk 'lib/arm64-v8a/libksud.so' -d /tmp/ksud
    python3 scripts/scan-embedded-elf.py /tmp/ksud/lib/arm64-v8a/libksud.so

The scan is validated where a manager publishes its payloads as well: inflating SukiSU's `libksud.so`
yields bytes equal to its published `*-lkm.zip` and `ksuinit-aarch64.zip` archives. Which stream is
which KMI is read from the module's own `vermagic`, anchored on SukiSU's *named* release archives,
which share the same DDK matrix:

| vermagic (first field) | KMI |
| --- | --- |
| `5.10.252-dirty` | `android12-5.10` |
| `5.10.245` | `android13-5.10` |
| `5.15.202-android13-5.15.202_r00-dirty` | `android13-5.15` |
| `5.15.202-dirty` | `android14-5.15` |
| `6.1.166-dirty` | `android14-6.1` |
| `6.6.127-4k-g46a034eca005-dirty` | `android15-6.6` |
| `6.12.76-4k` | `android16-6.12` |
| `6.18.32-4k-g47cc22554442-dirty` | `android17-6.18` |

The pairing is checked again at patch time: the provider reads the module's `.modinfo` and refuses a
module whose kernel version does not match the selected KMI, so a mislabelled payload cannot reach a
device silently. `tests/unit/bundled-artifacts.test.ts` also holds every bundled module to being a
relocatable ELF named `kernelsu` whose vermagic matches its KMI, and every wrapper to being an
executable rather than a module — a check that was missing until one module turned out to be the HTML
page a failed download had produced.

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
