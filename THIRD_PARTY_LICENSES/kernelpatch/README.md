# kernelpatch

Status: **bundled as WebAssembly**.

ImageForge ships a WebAssembly build of this project's `kptools` tool. The upstream
source tree is not modified in any way; see `third_party/kptools-wasm/README.md` for the
build record and the two libc entry points supplied by a separate compatibility file.

## Integration record

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/bmax121/KernelPatch |
| Pinned revision | `72a904c412754e25f54353c30f31f5c884ed0673` |
| Upstream version | 0.13.8 (kptools reports 0xd08) |
| Retrieved on | 2026-09-21 |
| License | GPL-2.0-or-later (LICENSE file plus `SPDX-License-Identifier: GPL-2.0-or-later` headers) |
| Bundled artifact | `public/wasm/kptools.wasm`, sha256 `bb53abeae8be16f4d2127af1b700d95ff8a75b38eea2829251c9f774c9b61c4c` |
| Local modifications to upstream sources | none |
| Additional files we add | `third_party/kptools-wasm/compat.c` and `compat.h` (`mkstemp`, `system` stub) |

## License compatibility

The upstream license text reads "either version 2 of the License, or (at your option) any
later version", and the source headers use the `GPL-2.0-or-later` SPDX identifier. That
makes linking this code into an AGPL-3.0-or-later application permissible. Had the project
been GPL-2.0-only, this bundle would not have been possible.

The complete upstream license text is in `LICENSE` in this directory.
