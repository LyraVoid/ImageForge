import { describe, expect, it } from "vitest";
import { canonicalizeCpio, parseCpio, serializeCpio } from "@/core/image";
import { cpioArchive } from "../fixtures/cpio";

describe("canonical cpio archives", () => {
  it("arranges an archive the way magiskboot writes one", () => {
    const archive = cpioArchive([
      { name: "z", data: "z" },
      { name: "a", data: "a" },
      { name: "dev", data: "", mode: 0o040755, nlink: 3 },
      // a repeated name is what some stock ramdisks contain; magiskboot's map keeps the last one
      { name: "dev", data: "", mode: 0o040555 },
      { name: "m", data: "m" },
    ]);
    archive.trailing = new Uint8Array([0, 0, 0, 0]);

    const canonical = canonicalizeCpio(archive);

    expect(canonical.entries.map((entry) => entry.name)).toEqual(["a", "dev", "m", "z"]);
    expect(canonical.entries.map((entry) => entry.ino)).toEqual([300000, 300001, 300002, 300003]);
    expect(canonical.entries.every((entry) => entry.nlink === 1 && entry.mtime === 0)).toBe(true);
    expect(canonical.entries.find((entry) => entry.name === "dev")?.mode).toBe(0o040555);
    expect(canonical.trailer.name).toBe("TRAILER!!!");
    expect(canonical.trailer.ino).toBe(300004);
    expect(canonical.trailer.mode).toBe(0o755);
    expect(canonical.trailing.length).toBe(0);

    // and the bytes are that layout: sorted names, the trailer last, nothing after it
    const bytes = serializeCpio(canonical);
    expect(new TextDecoder().decode(bytes.subarray(110, 112))).toBe("a\u0000");
    const reread = parseCpio(bytes);
    expect(reread.entries.map((entry) => entry.name)).toEqual(["a", "dev", "m", "z"]);
    expect(reread.trailer.ino).toBe(300004);
    expect(reread.trailing.length).toBe(0);
  });

  it("leaves an already canonical archive alone", () => {
    const once = canonicalizeCpio(cpioArchive([{ name: "b" }, { name: "a" }]));
    const twice = canonicalizeCpio(once);

    expect(twice.entries.map((entry) => entry.name)).toEqual(["a", "b"]);
    expect(serializeCpio(twice)).toEqual(serializeCpio(once));
  });
});
