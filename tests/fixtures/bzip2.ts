import { execFileSync } from "node:child_process";

/**
 * Compresses bytes into a bzip2 stream with the reference tool, so the decoder inside the WebAssembly
 * module is checked against an independent implementation rather than against itself. Tests that use
 * this skip themselves when the `bzip2` binary is not installed.
 */
export function bzip2Compress(data: Uint8Array): Uint8Array {
  const out = execFileSync("bzip2", ["-9", "-c"], { input: Buffer.from(data), maxBuffer: 512 * 1024 * 1024 });
  return new Uint8Array(out);
}

export function hasBzip2(): boolean {
  try {
    execFileSync("bzip2", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
