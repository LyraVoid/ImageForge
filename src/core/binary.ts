const TEXT_DECODER = new TextDecoder("utf-8");

export function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) {
    throw new RangeError("readUint32LE out of range: offset " + offset + " length " + bytes.length);
  }
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

export function readUint64LE(bytes: Uint8Array, offset: number): bigint {
  const low = BigInt(readUint32LE(bytes, offset));
  const high = BigInt(readUint32LE(bytes, offset + 4));
  return (high << 32n) | low;
}

export function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(offset, value >>> 0, true);
}

export function writeUint64LE(bytes: Uint8Array, offset: number, value: bigint): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setBigUint64(offset, value, true);
}

export function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function readCString(bytes: Uint8Array, offset: number, maxLength: number): string {
  const end = Math.min(offset + maxLength, bytes.length);
  let stop = offset;
  while (stop < end && bytes[stop] !== 0) stop += 1;
  return TEXT_DECODER.decode(bytes.subarray(offset, stop));
}

export function writeCString(bytes: Uint8Array, offset: number, maxLength: number, value: string): void {
  bytes.fill(0, offset, offset + maxLength);
  const encoded = new TextEncoder().encode(value);
  const length = Math.min(encoded.length, maxLength);
  bytes.set(encoded.subarray(0, length), offset);
}

export function align(value: number, alignment: number): number {
  if (alignment <= 1) return value;
  const remainder = value % alignment;
  return remainder === 0 ? value : value + (alignment - remainder);
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function isAllZero(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i += 1) if (bytes[i] !== 0) return false;
  return true;
}

export function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (bytes[i] !== prefix[i]) return false;
  return true;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "unknown";
  if (size < 1024) return size + " B";
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return value.toFixed(value >= 100 ? 0 : 1) + " " + units[unitIndex];
}
