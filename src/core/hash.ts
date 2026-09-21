import { toHex } from "./binary";

function subtleCrypto(): SubtleCrypto {
  const globalCrypto = globalThis.crypto;
  if (!globalCrypto || !globalCrypto.subtle) {
    throw new Error("WebCrypto SubtleCrypto is not available in this runtime.");
  }
  return globalCrypto.subtle;
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await subtleCrypto().digest("SHA-256", copy.buffer);
  return new Uint8Array(digest);
}

/**
 * SHA-1 hex digest. Magisk records the SHA-1 of the image it patches in its configuration, so a
 * patch that wants to be recognisable to Magisk has to produce the same value.
 */
export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await subtleCrypto().digest("SHA-1", copy.buffer);
  return toHex(new Uint8Array(digest));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(await sha256(bytes));
}

export async function sha256OfParts(parts: readonly Uint8Array[]): Promise<string> {
  let total = 0;
  for (const part of parts) total += part.length;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return sha256Hex(merged);
}
