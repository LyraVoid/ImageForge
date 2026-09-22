export interface WasmStatus {
  available: boolean;
  path: string;
  version: string | null;
  reason?: string;
}

export interface WasmImageModule {
  readonly kind: "wasm" | "typescript";
  readonly status: WasmStatus;
  crc32(bytes: Uint8Array): number;
  lz4BlockMaxSize(srcLength: number): number;
  /** `prefix` holds the previous 64 KiB window for LZ4 frames with dependent blocks. */
  lz4DecompressBlock(input: Uint8Array, expectedSize: number, prefix?: Uint8Array): Uint8Array;
  lz4CompressBlock(input: Uint8Array): Uint8Array;
  /** Expands an xz stream; the codec lives in the WebAssembly module. */
  xzDecompress(input: Uint8Array): Uint8Array;
  /** Compresses into an xz stream with magiskboot's settings (preset 6, CRC32 check). */
  xzCompress(input: Uint8Array): Uint8Array;
}

export const WASM_PATH = "/wasm/imageforge.wasm";
