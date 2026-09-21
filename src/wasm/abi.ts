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
  lz4DecompressBlock(input: Uint8Array, expectedSize: number): Uint8Array;
  lz4BlockMaxSize(srcLength: number): number;
}

export const WASM_PATH = "/wasm/imageforge.wasm";
