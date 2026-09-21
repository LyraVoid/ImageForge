# Third-party licenses

This directory is reserved for the verbatim license texts and copyright notices of every
third-party component that ImageForge links, embeds, bundles or downloads at runtime.

## Directory layout

    THIRD_PARTY_LICENSES/
    ├── magisk/
    ├── kernelsu/
    ├── apatch/
    └── kernelpatch/

Each subdirectory must contain, for the exact revision that ImageForge integrates:

1. the upstream `LICENSE` file, unmodified;
2. the upstream copyright notice(s);
3. a `README.md` recording the upstream repository URL, the pinned revision (commit or
   tag), the date the text was copied, and any local modifications made to that code.

## Rules

* Never re-license third-party code.
* Never merge code that is under different licenses into a single license file.
* Never copy an artifact into this repository before its upstream license has been read.
* The license of every upstream project must be taken from the current upstream revision;
  do not guess it and do not rely on second-hand summaries.

## Current status

ImageForge v0.1 does not bundle any upstream root solution code or artifact. The
subdirectories document integration policy only, so that adding a real provider is a
reviewable, license-aware change.
