# apatch

Status: **one artifact bundled (kpimg)**.

ImageForge ships the KernelPatch core image (`kpimg`) that APatch itself injects into
kernel images. It is taken from the official APatch release package rather than rebuilt
from source, so the provenance below records the exact release it came from.

## Integration record

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/bmax121/APatch |
| Pinned revision | `99fbd65d5ed2c8f3fa30f0ab3720213efa3592f3` |
| Release used for the artifact | `11224` (`APatch_11224_9a63e0f_HEAD-release-signed.apk`) |
| Retrieved on | 2026-09-21 |
| File inside the release package | `assets/kpimg` |
| License | GPL-3.0-or-later (LICENSE file) |
| Bundled artifact | `public/artifacts/apatch/kpimg`, 190816 bytes, sha256 `8f472d389d00f11c2d34c7059e1df8d580b9cb7d8c9f99b70877801b52992e2a` |
| Reported version | KernelPatch image version `0xd03`, config `android,release`, arch `arm64` |
| Local modifications | none (the file is redistributed byte for byte) |

## Why it is not rebuilt from source

`kpimg` is produced by the KernelPatch kernel build, which needs an Android kernel
toolchain. Redistributing the released binary keeps the provenance auditable: the exact
release, the exact file name inside it and its digest are recorded above. If the artifact
is ever rebuilt, this file must record the toolchain, the commands and the new digest.

The complete upstream license text is in `LICENSE` in this directory.
