# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting on
<https://github.com/LyraVoid/ImageForge> — *Security* → *Report a vulnerability* — which opens a draft
advisory visible only to the maintainers. If you cannot use it, open a minimal issue saying that you have something to report
privately and wait for a reply before writing any details.

Please include what you need to make the report actionable: the version or commit, the browser and
platform, the steps, and the diagnostics export from the result page if the problem happened during a
run (it contains the plan and the artifact names, but no image bytes and no secret).

## What is in scope

* **The application** — anything that could make it produce a wrong image, leak an image or a secret,
  or run code that did not come from this repository. The interesting surfaces are the artifact
  registry (a payload is digest verified before it is used, and the digest is pinned in
  `src/core/artifacts/catalog.ts` and `src/wasm/assets.ts`), the parsers that read untrusted files
  and images, and the WebAssembly modules it loads.
* **The bundled artifacts** — if a payload in `public/artifacts/` or `public/wasm/` does not match
  the digest, revision and upstream release recorded in `THIRD_PARTY_LICENSES/`, that is a real bug
  and we want to know.
* **A claim in the documentation that is not true** — this project's documentation makes testable
  statements ("byte for byte the one the official app writes"). A false one is a defect, not a
  wording preference.

## What is out of scope

* **A device that will not boot.** Flashing is the user's decision and the project says so
  everywhere; questions about a specific device belong in the issue tracker, not here.
* **Vulnerabilities in the upstream projects** whose releases are bundled (Magisk, KernelSU, APatch,
  KernelPatch and their forks). They are redistributed unmodified as separate programs; report those
  upstream. Their payloads are data written into an image, not code this project executes.
* **Root detection, safety-net and anti-cheat bypasses**, or anything that tries to make a device
  hide that it is rooted. That is not what this tool is for.
* **A manager app behaving badly.** This project stops at the produced image.

## What the project already does

* No server, no upload: parsing, patching and hashing happen in the browser, in a Web Worker.
* No `eval`, no `new Function`, no execution of anything supplied by a user.
* Every bundled payload is digest verified before use, and every one is registered with a pinned
  upstream revision and license in `THIRD_PARTY_LICENSES/`.
* Secrets (a superkey) never enter a plan, the metadata or the produced image; only its SHA-256 is
  written into the kernel.
* The diagnostics export never contains image bytes or the superkey.
