import { CPIO_TRAILER, serializeCpio } from "@/core/image";
import type { CpioArchive, CpioEntry } from "@/core/image";

export interface CpioFixtureEntry {
  name: string;
  data?: string | Uint8Array;
  mode?: number;
  nlink?: number;
}

export function cpioEntry(entry: CpioFixtureEntry): CpioEntry {
  return {
    name: entry.name,
    ino: 1,
    mode: entry.mode ?? 0o100644,
    uid: 0,
    gid: 0,
    nlink: entry.nlink ?? 1,
    mtime: 0,
    devmajor: 0,
    devminor: 0,
    rdevmajor: 0,
    rdevminor: 0,
    check: 0,
    data:
      entry.data === undefined
        ? new Uint8Array(0)
        : typeof entry.data === "string"
          ? new TextEncoder().encode(entry.data)
          : entry.data,
  };
}

export function cpioArchive(entries: CpioFixtureEntry[]): CpioArchive {
  return {
    format: "newc",
    entries: entries.map(cpioEntry),
    trailer: { ...cpioEntry({ name: CPIO_TRAILER }), ino: 0, mode: 0 },
    trailing: new Uint8Array(0),
  };
}

/** A ramdisk as Android writes it: an uncompressed CPIO archive. */
export function buildRamdisk(entries: CpioFixtureEntry[]): Uint8Array {
  return serializeCpio(cpioArchive(entries));
}
