import { describe, expect, it } from "vitest";
import { CPIO_TRAILER, findEntry, isCpio, parseCpio, removeEntry, serializeCpio, upsertEntry } from "@/core/image";
import type { CpioArchive, CpioEntry } from "@/core/image";

function entry(name: string, data: Uint8Array | string = "", overrides: Partial<CpioEntry> = {}): CpioEntry {
  return {
    name,
    ino: 1,
    mode: 0o100644,
    uid: 0,
    gid: 0,
    nlink: 1,
    mtime: 0,
    devmajor: 0,
    devminor: 0,
    rdevmajor: 0,
    rdevminor: 0,
    check: 0,
    data: typeof data === "string" ? new TextEncoder().encode(data) : data,
    ...overrides,
  };
}

function archive(entries: CpioEntry[], overrides: Partial<CpioArchive> = {}): CpioArchive {
  return {
    format: "newc",
    entries,
    trailer: entry(CPIO_TRAILER, "", { ino: 0, mode: 0, nlink: 1 }),
    trailing: new Uint8Array(0),
    ...overrides,
  };
}

describe("CPIO newc archives", () => {
  it("round trips an archive byte for byte", () => {
    const original = archive([
      entry(".", "", { mode: 0o040755, nlink: 2 }),
      entry("init", "#!/system/bin/sh\n"),
      entry("dev", "", { mode: 0o040755, nlink: 3 }),
      entry("dev/null", "", { mode: 0o020666, rdevmajor: 1, rdevminor: 3 }),
      entry("system/bin/linker64", new Uint8Array(300)),
    ]);
    original.trailing = new Uint8Array([0, 0, 0, 0, 7]);

    const bytes = serializeCpio(original);
    expect(isCpio(bytes)).toBe(true);

    const parsed = parseCpio(bytes);
    expect(parsed.entries.map((item) => item.name)).toEqual([
      ".",
      "init",
      "dev",
      "dev/null",
      "system/bin/linker64",
    ]);
    expect(parsed.format).toBe("newc");
    expect(parsed.trailing.length).toBe(5);
    expect(serializeCpio(parsed)).toEqual(bytes);
  });

  it("keeps the fields the producer wrote, including the trailer", () => {
    const original = archive([
      entry("keep", "payload", { ino: 0xdeadbeef, uid: 1000, gid: 1000, nlink: 4, mtime: 0x5f5e100, check: 0x1234 }),
    ]);
    original.trailer = entry(CPIO_TRAILER, "", { ino: 42, mode: 0o100644, nlink: 7 });

    const parsed = parseCpio(serializeCpio(original));
    expect(parsed.entries[0].ino).toBe(0xdeadbeef);
    expect(parsed.entries[0].uid).toBe(1000);
    expect(parsed.entries[0].nlink).toBe(4);
    expect(parsed.entries[0].mtime).toBe(0x5f5e100);
    expect(parsed.trailer.nlink).toBe(7);
    expect(parsed.trailer.ino).toBe(42);
    expect(serializeCpio(parsed)).toEqual(serializeCpio(original));
  });

  it("handles names across the four byte alignment", () => {
    for (const length of [1, 2, 3, 4, 5, 6, 7, 8, 9, 40, 41]) {
      const name = "n".repeat(length);
      const bytes = serializeCpio(archive([entry(name, "x")]));
      expect(parseCpio(bytes).entries[0].name).toBe(name);
      expect(serializeCpio(parseCpio(bytes))).toEqual(bytes);
    }
  });

  it("supports the crc flavour", () => {
    const original = archive([entry("file", "data", { check: 0xabcdef12 })], { format: "crc" });
    const parsed = parseCpio(serializeCpio(original));
    expect(parsed.format).toBe("crc");
    expect(parsed.entries[0].check).toBe(0xabcdef12);
  });

  it("finds, replaces, inserts and removes entries", () => {
    const original = archive([entry("a", "1"), entry("b", "2")]);

    expect(findEntry(original, "b")?.data.length).toBe(1);
    upsertEntry(original, "b", new TextEncoder().encode("22"));
    expect(findEntry(original, "b")?.data.length).toBe(2);
    upsertEntry(original, "c", new TextEncoder().encode("333"), 0o100755);
    expect(original.entries.length).toBe(3);
    expect(findEntry(original, "c")?.mode).toBe(0o100755);

    expect(removeEntry(original, "a")).toBe(true);
    expect(removeEntry(original, "a")).toBe(false);
    expect(parseCpio(serializeCpio(original)).entries.map((item) => item.name)).toEqual(["b", "c"]);
  });

  it("rejects malformed archives", () => {
    expect(() => parseCpio(new Uint8Array(8))).toThrowError(/newc header/);

    const notCpio = new Uint8Array(120);
    notCpio.set(new TextEncoder().encode("NOTCPIO"), 0);
    expect(() => parseCpio(notCpio)).toThrowError(/newc header/);

    const noTrailer = serializeCpio(archive([entry("x", "y")])).subarray(0, 130);
    expect(() => parseCpio(noTrailer)).toThrow();

    const truncatedName = serializeCpio(archive([entry("long-name-entry", "data")]));
    truncatedName[94] = "f".charCodeAt(0);
    truncatedName[95] = "f".charCodeAt(0);
    expect(() => parseCpio(truncatedName)).toThrowError(/name|past the end/);

    const truncatedData = serializeCpio(archive([entry("x", "0123456789")]));
    truncatedData[54] = "0".charCodeAt(0);
    truncatedData[55] = "f".charCodeAt(0);
    expect(() => parseCpio(truncatedData)).toThrowError(/past the end/);
  });
});
