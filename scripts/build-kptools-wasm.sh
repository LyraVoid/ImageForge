#!/usr/bin/env bash
# Reproducible build of the upstream KernelPatch kptools tool as WebAssembly.
#
# Everything is fetched from a pinned upstream revision. The KernelPatch tree is
# never modified: preset.h is copied into a dedicated directory (which is what
# upstream's own kernel/Makefile does) and two missing wasi-libc entry points are
# supplied by third_party/kptools-wasm/compat.c.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/.wasm-build"

WASI_SDK_VERSION="34.0"
WASI_SDK_DIR="wasi-sdk-${WASI_SDK_VERSION}-x86_64-linux"
ZLIB_VERSION="1.3.1"
KERNELPATCH_REVISION="72a904c412754e25f54353c30f31f5c884ed0673"

mkdir -p "${WORK}"
cd "${WORK}"

if [ ! -d "${WASI_SDK_DIR}" ]; then
  echo "==> fetching wasi-sdk ${WASI_SDK_VERSION}"
  curl -sSL -o wasi-sdk.tar.gz "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/${WASI_SDK_DIR}.tar.gz"
  tar -xzf wasi-sdk.tar.gz
fi
SDK="${WORK}/${WASI_SDK_DIR}"

if [ ! -d "zlib-${ZLIB_VERSION}" ]; then
  echo "==> fetching zlib ${ZLIB_VERSION}"
  curl -sSL -o zlib.tar.gz "https://github.com/madler/zlib/archive/refs/tags/v${ZLIB_VERSION}.tar.gz"
  tar -xzf zlib.tar.gz
fi
if [ ! -f "${WORK}/zlib-wasi/lib/libz.a" ]; then
  echo "==> building zlib for wasm32-wasip1"
  cd "zlib-${ZLIB_VERSION}"
  CC="${SDK}/bin/clang" AR="${SDK}/bin/llvm-ar" RANLIB="${SDK}/bin/llvm-ranlib" \
    ./configure --static --prefix="${WORK}/zlib-wasi" >/dev/null
  make -j"$(nproc)" >/dev/null
  make install >/dev/null
  cd "${WORK}"
fi

if [ ! -d "KernelPatch-${KERNELPATCH_REVISION}" ]; then
  echo "==> fetching KernelPatch ${KERNELPATCH_REVISION}"
  curl -sSL -o kernelpatch.tar.gz "https://github.com/bmax121/KernelPatch/archive/${KERNELPATCH_REVISION}.tar.gz"
  tar -xzf kernelpatch.tar.gz
fi
KP="${WORK}/KernelPatch-${KERNELPATCH_REVISION}"

echo "==> preparing preset.h (upstream kernel/Makefile:138 does the same)"
mkdir -p "${WORK}/include"
cp -f "${KP}/kernel/include/preset.h" "${WORK}/include/"

echo "==> compiling kptools"
cd "${KP}/tools"
"${SDK}/bin/clang" --target=wasm32-wasip1 -mexec-model=command -O2 -std=c11 -w \
  -include "${ROOT}/third_party/kptools-wasm/compat.h" \
  -I"${WORK}/include" -I. -I./lib -I"${WORK}/zlib-wasi/include" \
  -DBZ_NO_STDIO -DXZ_DEC_ANY_CHECK \
  image.c kallsym.c kptools.c order.c insn.c patch.c symbol.c kpm.c common.c bootimg.c x86_64.c \
  $(find lib -name '*.c') \
  "${ROOT}/third_party/kptools-wasm/compat.c" \
  -L"${WORK}/zlib-wasi/lib" -lz \
  -o "${ROOT}/public/wasm/kptools.wasm"

echo "==> wrote ${ROOT}/public/wasm/kptools.wasm"
sha256sum "${ROOT}/public/wasm/kptools.wasm"
