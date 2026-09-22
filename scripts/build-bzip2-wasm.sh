#!/usr/bin/env bash
# Reproducible build of the reference bzip2 decompressor as WebAssembly.
#
# OTA payloads carry partitions as REPLACE_BZ operations, and the streams are whatever the vendor's
# tooling wrote: the pure Rust decoder this project first used rejects one of the real streams from a
# CPH2723 full OTA that the reference tool reads without complaint, so the reference implementation
# is compiled in and used instead. bzip2 1.0.8 is the last upstream release (BSD-like licence, see
# THIRD_PARTY_LICENSES/bzip2). Upstream sources are not modified: the script only compiles them and
# adds the shim next to it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/.wasm-build"

BZIP2_VERSION="1.0.8"
BZIP2_TARBALL_SHA256="ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269"
WASI_SDK_VERSION="34.0"
WASI_SDK_DIR="wasi-sdk-${WASI_SDK_VERSION}-x86_64-linux"

mkdir -p "${WORK}"
cd "${WORK}"

if [ ! -f "bzip2-${BZIP2_VERSION}.tar.gz" ]; then
  echo "==> fetching bzip2 ${BZIP2_VERSION}"
  curl -sSL -o "bzip2-${BZIP2_VERSION}.tar.gz" \
    "https://sourceware.org/pub/bzip2/bzip2-${BZIP2_VERSION}.tar.gz"
fi

echo "==> verifying the upstream tarball"
echo "${BZIP2_TARBALL_SHA256}  bzip2-${BZIP2_VERSION}.tar.gz" | sha256sum -c -

if [ ! -d "bzip2-${BZIP2_VERSION}" ]; then
  tar -xzf "bzip2-${BZIP2_VERSION}.tar.gz"
fi

if [ ! -d "${WASI_SDK_DIR}" ]; then
  if [ -d "${ROOT}/.research/toolchain/${WASI_SDK_DIR}" ]; then
    echo "==> using the cached wasi-sdk in .research/toolchain"
    cp -r "${ROOT}/.research/toolchain/${WASI_SDK_DIR}" .
  else
    echo "==> fetching wasi-sdk ${WASI_SDK_VERSION}"
    curl -sSL -o wasi-sdk.tar.gz \
      "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/${WASI_SDK_DIR}.tar.gz"
    tar -xzf wasi-sdk.tar.gz
  fi
fi
SDK="${WORK}/${WASI_SDK_DIR}"

cp "${ROOT}/third_party/bzip2-wasm/bz2_shim.c" "bzip2-${BZIP2_VERSION}/"

echo "==> compiling bzip2 ${BZIP2_VERSION} for wasm32-wasip1"
cd "bzip2-${BZIP2_VERSION}"
"${SDK}/bin/clang" --target=wasm32-wasip1 -mexec-model=reactor \
  -O3 -DNDEBUG -DBZ_NO_STDIO \
  -Wl,--no-entry \
  -Wl,--export=_initialize \
  -Wl,--export=malloc -Wl,--export=free \
  -Wl,--export=bz2_decompress \
  -o "${ROOT}/public/wasm/bzip2.wasm" \
  bz2_shim.c bzlib.c decompress.c huffman.c crctable.c randtable.c

cd "${ROOT}"
echo "==> wrote public/wasm/bzip2.wasm"
ls -l public/wasm/bzip2.wasm
sha256sum public/wasm/bzip2.wasm
