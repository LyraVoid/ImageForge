# Working notes for agents

Read the local working memory before changing anything. It is deliberately **not committed**
(`.research/` is ignored) because it contains machine specific paths and material:

* `.research/docs.md` — the phase one specification these sources implement.
* `.research/memory/` — current state, architecture invariants, decisions and their reasons,
  known pitfalls (including mistakes already made), artifact digests and provenance,
  environment quirks, and next steps.

## Rules this repository follows

The full list is in `docs/architecture.md`; the short version:

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
