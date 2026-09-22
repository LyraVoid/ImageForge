import { loadWasmModule } from "../../wasm/loader";

/**
 * xz, the container Magisk's patcher uses for its ramdisk payloads and one of the containers
 * Android kernels and ramdisks come in. The codec lives in the WebAssembly module, which uses the
 * same crate and settings as magiskboot (preset 6 and a CRC32 check).
 */
export async function decodeXz(bytes: Uint8Array): Promise<Uint8Array> {
  const wasm = await loadWasmModule();
  return wasm.xzDecompress(bytes);
}

export async function encodeXz(raw: Uint8Array): Promise<Uint8Array> {
  const wasm = await loadWasmModule();
  return wasm.xzCompress(raw);
}
