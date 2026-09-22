import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildZip } from "@/core/image";
import { bytesSource, listZip, readZipEntry } from "@/core/package";
import { sha256Hex } from "@/core/hash";

describe("the zip writer", () => {
  const entries = [
    { name: "frames/boot.bmp", data: new Uint8Array(4096).map((_, index) => index % 251) },
    { name: "frames/at.bmp", data: new TextEncoder().encode("a small frame") },
    { name: "frames.json", data: new TextEncoder().encode('{"frames":2}') },
  ];

  it("writes an archive its own reader accepts, entry for entry", async () => {
    const zip = await buildZip(entries);
    const source = bytesSource(zip);

    const listed = await listZip(source);
    expect(listed.map((entry) => entry.name)).toEqual(entries.map((entry) => entry.name));
    for (const entry of entries) {
      const read = await readZipEntry(source, listed.find((candidate) => candidate.name === entry.name) as never);
      expect(await sha256Hex(read)).toBe(await sha256Hex(entry.data));
    }
  });

  it("is deterministic: the same entries produce the same bytes", async () => {
    expect(await sha256Hex(await buildZip(entries))).toBe(await sha256Hex(await buildZip(entries)));
  });

  it("produces an archive the system unzip reads back byte for byte", async () => {
    const zip = await buildZip(entries);
    writeFileSync("/tmp/imageforge-export.zip", zip);

    // -t checks every entry's CRC, which is an independent implementation agreeing with ours
    const checked = execFileSync("unzip", ["-t", "/tmp/imageforge-export.zip"], { encoding: "utf8" });
    expect(checked).toContain("No errors detected");
    for (const entry of entries) {
      const extracted = new Uint8Array(
        execFileSync("unzip", ["-p", "/tmp/imageforge-export.zip", entry.name], { maxBuffer: 64 * 1024 * 1024 }),
      );
      expect(await sha256Hex(extracted), entry.name).toBe(await sha256Hex(entry.data));
    }
  });

  it("refuses an empty archive instead of writing a broken one", async () => {
    await expect(buildZip([])).rejects.toThrowError(/nothing to export/i);
  });
});
