import { toHex } from "./binary";

/**
 * Hashing, with WebCrypto when the runtime has it and a JavaScript implementation when it does not.
 *
 * `crypto.subtle` only exists in a **secure context**, which is a real deployment condition rather
 * than a curiosity: a site served over plain HTTP, or previewed from an IP address, has no WebCrypto
 * at all. This project hashes bytes for a living — every bundled artifact is verified against a
 * pinned digest before it is used, a plan id is a hash, a Magisk configuration carries the SHA-1 of
 * the image — so "no WebCrypto" cannot mean "no hashing".
 *
 * The fallback is the audited `@noble/hashes` implementation, loaded on demand so the common path
 * pays nothing for it. Both paths produce the same bytes, which the tests check against each other
 * and against published vectors.
 */

export type HashAlgorithm = "SHA-256" | "SHA-1";

/** True when the runtime can hash without loading the JavaScript fallback. */
export function hasWebCrypto(): boolean {
  return typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle !== undefined;
}

async function fallbackDigest(algorithm: HashAlgorithm, bytes: Uint8Array): Promise<Uint8Array> {
  if (algorithm === "SHA-256") {
    const { sha256 } = await import("@noble/hashes/sha2.js");
    return sha256(bytes);
  }
  const { sha1 } = await import("@noble/hashes/legacy.js");
  return sha1(bytes);
}

async function digest(algorithm: HashAlgorithm, bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    // A copy, because `digest` takes a buffer and a caller may pass a view into shared memory.
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new Uint8Array(await subtle.digest(algorithm, copy.buffer));
  }
  return fallbackDigest(algorithm, bytes);
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return digest("SHA-256", bytes);
}

/**
 * SHA-1 hex digest. Magisk records the SHA-1 of the image it patches in its configuration, so a
 * patch that wants to be recognisable to Magisk has to produce the same value.
 */
export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  return toHex(await digest("SHA-1", bytes));
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
