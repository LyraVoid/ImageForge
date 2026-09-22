#!/usr/bin/env bash
# Reproducible build of the reference LZ4 block codec as WebAssembly.
#
# The container writers in this project have to produce the bytes a device bootloader (and the
# official patchers) expect, so the compressor is the reference implementation itself, pinned to
# the version magiskboot links (lz4-sys 1.11.1+lz4-1.10.0 in Magisk v30.7, and the lz4 submodule
# of its tree). Upstream sources are not modified: the script only compiles them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/.wasm-build"

LZ4_VERSION="1.10.0"
LZ4_TARBALL_SHA256="537512904744b35e232912055ccf8ec66d768639ff3abe5788d90d792ec5f48b"
WASI_SDK_VERSION="34.0"
WASI_SDK_DIR="wasi-sdk-${WASI_SDK_VERSION}-x86_64-linux"

mkdir -p "${WORK}"
cd "${WORK}"

if [ ! -f "lz4-${LZ4_VERSION}.tar.gz" ]; then
  echo "==> fetching lz4 ${LZ4_VERSION}"
  curl -sSL -o "lz4-${LZ4_VERSION}.tar.gz" \
    "https://github.com/lz4/lz4/archive/refs/tags/v${LZ4_VERSION}.tar.gz"
fi

echo "==> verifying the upstream tarball"
echo "${LZ4_TARBALL_SHA256}  lz4-${LZ4_VERSION}.tar.gz" | sha256sum -c -

if [ ! -d "lz4-${LZ4_VERSION}" ]; then
  tar -xzf "lz4-${LZ4_VERSION}.tar.gz"
fi

# The wasi-sdk is shared with the kptools build; the cached copy under .research is used when it
# is there so this script also works without fetching the toolchain again.
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

echo "==> compiling liblz4 ${LZ4_VERSION} for wasm32-wasip1"
cd "lz4-${LZ4_VERSION}/lib"
"${SDK}/bin/clang" --target=wasm32-wasip1 -mexec-model=reactor \
  -O3 -DNDEBUG \
  -Wl,--no-entry \
  -Wl,--export=_initialize \
  -Wl,--export=malloc -Wl,--export=free \
  -Wl,--export=LZ4_compress_HC -Wl,--export=LZ4_compressBound -Wl,--export=LZ4_versionNumber \
  -o "${ROOT}/public/wasm/lz4.wasm" \
  lz4.c lz4hc.c

cd "${ROOT}"
echo "==> wrote public/wasm/lz4.wasm"
ls -l public/wasm/lz4.wasm
sha256sum public/wasm/lz4.wasm
