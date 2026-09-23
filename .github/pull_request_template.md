## What this changes

<!-- One paragraph. The diff says what; say why it is the right change. -->

## How it was checked

- [ ] `pnpm verify` passes (docs check, typecheck, lint, tests, build)
- [ ] Tests that need material were run with it, or the reason they skip is named below
- [ ] A byte-level change was checked against a reference, not against this project's own output
      (which reference, and how, goes below)
- [ ] New bundled payloads are digest verified, registered with a pinned revision in
      `THIRD_PARTY_LICENSES/`, and checked to be what they claim to be (not just unchanged)

## Not verified

<!--
What you could not check, and what would check it. This section is the honest one: it is better to
say "no reference image for this manager exists yet" than to let a weaker claim read as a stronger
one. Write "nothing" if there is nothing.
-->

## Notes for the reviewer

<!-- Anything a reader of the diff would otherwise have to guess: a decision and its alternative, an
upstream behaviour that surprised you, a file:line citation you relied on. -->
