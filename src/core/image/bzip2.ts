import { loadWasmModule } from "../../wasm/loader";

/**
 * bzip2 decoding, which real OTA payloads need: a partition stored as `REPLACE_BZ` carries one
 * bzip2 stream per operation. The decoder is a pure Rust crate compiled into
 * `public/wasm/imageforge.wasm`; there is no TypeScript implementation, so a browser that could not
 * load the module says so instead of failing quietly.
 *
 * `capacityHint` is the room the operation's extents give the stream, which is exactly how large the
 * expansion is expected to be.
 */
export async function decodeBzip2(input: Uint8Array, capacityHint?: number): Promise<Uint8Array> {
  if (input.length === 0) return new Uint8Array(0);
  const wasm = await loadWasmModule();
  return wasm.bzip2Decompress(input, capacityHint);
}
