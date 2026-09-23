# Working agreements

How this repository is changed, whether by a person or by a tool. The rules below are the short
version of the **Hard rules** in [docs/architecture.md](docs/architecture.md) and of the testing
conventions in [docs/testing.md](docs/testing.md); [CONTRIBUTING.md](CONTRIBUTING.md) says how to
work with them in practice.

## Rules this repository follows

* Providers never parse boot containers. The Image Engine hands them the sections they need and
  repacks the container afterwards.
* A plan must pin exactly what a run carries. Attachments (KernelPatch modules) are
  authoritative, and the plan records their names, never their bytes.
* Binaries never travel through `PatchOptions`; secrets (a superkey) never enter a plan, the
  metadata or the output image.
* Bundled artifacts are digest verified before use, their URLs are content addressed, and every
  GPL artifact is registered in `THIRD_PARTY_LICENSES/` with a pinned revision.
* Read upstream sources instead of guessing, and cite `file:line` in the note or comment that
  depends on them.
* `pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass before a commit. Tests that
  need real images, device dumps or third party modules skip themselves and document the
  environment variable that supplies the material.
* ImageForge never flashes a device. The pipeline ends at a downloaded image, and the patch page
  states which manager app the produced image requires.
