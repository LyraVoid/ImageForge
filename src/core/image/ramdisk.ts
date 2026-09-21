import type { CompressionDescriptor } from "./compression";
import { compressSection, decompressSection, describeCompression } from "./compression";
import type { CpioArchive } from "./cpio";
import { parseCpio, serializeCpio } from "./cpio";

/**
 * A ramdisk as the providers need it: the archive, the payload it decodes to, and the container
 * it has to be written back into. Providers never touch compression themselves.
 */
export interface DecodedRamdisk {
  descriptor: CompressionDescriptor;
  payload: Uint8Array;
  archive: CpioArchive;
}

/** Decodes a ramdisk section: expands the container, then parses the CPIO archive. */
export async function decodeRamdisk(section: Uint8Array): Promise<DecodedRamdisk> {
  const descriptor = describeCompression(section);
  const payload = await decompressSection(section, descriptor);
  return { descriptor, payload, archive: parseCpio(payload) };
}

/** Writes an archive back into the container it came from. */
export async function encodeRamdisk(
  archive: CpioArchive,
  descriptor: CompressionDescriptor,
): Promise<Uint8Array> {
  return compressSection(serializeCpio(archive), descriptor);
}

/**
 * True when the bytes decode back to an archive with the same entries and payloads. Used by the
 * verifier and by tests: an edited ramdisk has to survive the container round trip.
 */
export async function ramdiskDecodesTo(section: Uint8Array, expected: CpioArchive): Promise<boolean> {
  const decoded = await decodeRamdisk(section);
  if (decoded.archive.entries.length !== expected.entries.length) return false;
  if (decoded.archive.trailing.length !== expected.trailing.length) return false;
  for (let index = 0; index < expected.entries.length; index += 1) {
    const left = decoded.archive.entries[index];
    const right = expected.entries[index];
    if (left.name !== right.name || left.mode !== right.mode || left.data.length !== right.data.length) {
      return false;
    }
    for (let offset = 0; offset < right.data.length; offset += 1) {
      if (left.data[offset] !== right.data[offset]) return false;
    }
  }
  return true;
}
