#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATE="${ROOT}/crates/imageforge-wasm"
OUT="${ROOT}/public/wasm"

echo "==> ensuring the wasm32-unknown-unknown target is installed"
rustup target add wasm32-unknown-unknown

echo "==> building ${CRATE}"
cargo build --manifest-path "${CRATE}/Cargo.toml" --target wasm32-unknown-unknown --release

mkdir -p "${OUT}"
cp "${CRATE}/target/wasm32-unknown-unknown/release/imageforge_wasm.wasm" "${OUT}/imageforge.wasm"

echo "==> wrote ${OUT}/imageforge.wasm"
ls -l "${OUT}/imageforge.wasm"
