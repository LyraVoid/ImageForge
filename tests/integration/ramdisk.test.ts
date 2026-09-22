import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertBootImage, buildImageReport, parseImage, sectionOf } from "@/core/image";
import { decodeRamdisk, encodeRamdisk, ramdiskDecodesTo } from "@/core/image";
import { findEntry, serializeCpio, upsertEntry } from "@/core/image";
import { repoPath } from "../fixtures/artifacts";

const INIT_BOOT_PATH = process.env.IMAGEFORGE_INIT_BOOT ?? repoPath(".research", "aster-validation", "init_boot.img");
const hasInitBoot = existsSync(INIT_BOOT_PATH);

/**
 * The acceptance criterion for the ramdisk layer: a real device ramdisk has to survive decoding
 * and writing back byte for byte before any provider is allowed to touch one.
 */
describe.skipIf(!hasInitBoot)("ramdisk layer against a real init_boot image", () => {
  it(
    "decodes, round trips and edits a real ramdisk",
    async () => {
      const image = assertBootImage(parseImage(new Uint8Array(readFileSync(INIT_BOOT_PATH))));
      const section = sectionOf(image, "ramdisk");
      expect(section).toBeDefined();
      const ramdiskBytes = section?.data ?? new Uint8Array();

      const decoded = await decodeRamdisk(ramdiskBytes);
      expect(decoded.descriptor.format).not.toBe("unknown");
      expect(decoded.archive.format).toBe("newc");
      expect(decoded.archive.entries.length).toBeGreaterThan(5);
      expect(decoded.archive.entries.some((item) => item.name === "dev/null")).toBe(true);
      expect(decoded.archive.entries.some((item) => (item.mode & 0o170000) === 0o040000)).toBe(true);

      // byte exact payload round trip
      expect(serializeCpio(decoded.archive)).toEqual(decoded.payload);

      // byte exact container round trip through our own compressor
      const reencoded = await encodeRamdisk(decoded.archive, decoded.descriptor);
      expect(await ramdiskDecodesTo(reencoded, decoded.archive)).toBe(true);

      // an edited ramdisk still round trips and keeps the untouched entries
      const edited = await decodeRamdisk(ramdiskBytes);
      upsertEntry(edited.archive, "data/local/tmp/placeholder", new TextEncoder().encode("imageforge\n"));
      expect(findEntry(edited.archive, "data/local/tmp/placeholder")).toBeDefined();
      const editedBytes = await encodeRamdisk(edited.archive, edited.descriptor);
      const reread = await decodeRamdisk(editedBytes);
      expect(reread.archive.entries.length).toBe(edited.archive.entries.length);
      expect(findEntry(reread.archive, "data/local/tmp/placeholder")?.data.length).toBe(11);
      expect(findEntry(reread.archive, "dev/null")).toBeDefined();

      // the analysis report tells the user what is inside the ramdisk
      const report = await buildImageReport(image, { sourceName: "init_boot.img" });
      const group = report.groups.find((entry: { id: string }) => entry.id === "ramdisk");
      const value = (label: string): string | undefined =>
        (group?.fields as { label: string; value: string }[] | undefined)?.find(
          (item) => item.label === label,
        )?.value;
      expect(value("Archive")).toBe("CPIO newc");
      expect(value("Entries")).toBe(String(decoded.archive.entries.length));
      expect(Number(value("Directories"))).toBeGreaterThanOrEqual(1);
      expect(Number(value("Files"))).toBeGreaterThanOrEqual(1);
      expect(value("Compression")).toBe("LZ4 (legacy)");
    },
    300000,
  );
});
