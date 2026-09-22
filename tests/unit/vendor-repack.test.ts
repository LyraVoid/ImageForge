import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseImage, sectionOf } from "@/core/image";
import { encodeVendorRamdiskTable, repackVendorBootImage } from "@/core/image/bootimage/vendor-repacker";
import type { ParsedVendorBootImage } from "@/core/image";
import { repoPath } from "../fixtures/artifacts";

const VENDOR_BOOT_PATH = process.env.IMAGEFORGE_VENDOR_BOOT ?? repoPath(".research", "aster-validation", "vendor_boot.img");
const hasVendorBoot = existsSync(VENDOR_BOOT_PATH);

function loadImage(): ParsedVendorBootImage {
  const image = parseImage(new Uint8Array(readFileSync(VENDOR_BOOT_PATH)));
  if (image.format !== "vendor_boot") throw new Error("not a vendor boot image");
  return image;
}

describe.skipIf(!hasVendorBoot)("vendor boot repacking against a real image", () => {
  it("re-encodes the ramdisk table byte for byte", () => {
    const image = loadImage();
    const table = sectionOf(image, "vendor_ramdisk_table");
    if (!table) throw new Error("no table");

    const rebuilt = encodeVendorRamdiskTable(image.header.ramdiskTable, image.header.ramdiskTableEntrySize);
    expect(Array.from(rebuilt)).toEqual(Array.from(table.data));
  }, 120000);

  it("keeps every other section in place when a fragment is replaced with the same bytes", () => {
    const image = loadImage();
    const region = sectionOf(image, "vendor_ramdisk");
    if (!region) throw new Error("no region");

    const outcome = repackVendorBootImage({
      image,
      fragments: [{ index: 0, data: new Uint8Array(region.data) }],
      padTo: image.totalSize,
    });
    const produced = parseImage(outcome.bytes);
    if (produced.format !== "vendor_boot") throw new Error("not vendor boot");

    // the ramdisk, the dtb, the table and the bootconfig all sit exactly where they did
    for (const name of ["vendor_ramdisk", "dtb", "vendor_ramdisk_table", "bootconfig"] as const) {
      const before = sectionOf(image, name);
      const after = sectionOf(produced, name);
      expect(after?.offset).toBe(before?.offset);
      expect(after?.size).toBe(before?.size);
      expect(Array.from(after?.data ?? [])).toEqual(Array.from(before?.data ?? []));
    }
    expect(produced.totalSize).toBe(image.totalSize);
    expect(outcome.warnings.join(" ")).not.toMatch(/changed by/);
  }, 180000);

  it("moves the later sections and updates the table when a fragment grows", () => {
    const image = loadImage();
    const region = sectionOf(image, "vendor_ramdisk");
    if (!region) throw new Error("no region");

    const grown = new Uint8Array(region.data.length + 4096);
    grown.set(region.data, 0);
    const outcome = repackVendorBootImage({
      image,
      fragments: [{ index: 0, data: grown }],
      padTo: image.totalSize,
    });
    const produced = parseImage(outcome.bytes);
    if (produced.format !== "vendor_boot") throw new Error("not vendor boot");

    expect(produced.header.vendorRamdiskSize).toBe(grown.length);
    expect(produced.header.ramdiskTable[0]?.ramdiskSize).toBe(grown.length);
    expect(produced.header.ramdiskTable[0]?.ramdiskOffset).toBe(0);

    // The later sections keep their content and move forward. Their exact shift is not the size
    // delta alone: the ramdisk region is page aligned and the source image has its own gaps, so the
    // repacker reproduces the original geometry shifted rather than recomputing it, and it is the
    // produced image's own header that has to stay consistent.
    for (const name of ["dtb", "bootconfig"] as const) {
      const before = sectionOf(image, name);
      const after = sectionOf(produced, name);
      expect(after?.offset ?? 0).toBeGreaterThan(before?.offset ?? 0);
      expect(after?.size).toBe(before?.size);
      expect(Array.from(after?.data ?? [])).toEqual(Array.from(before?.data ?? []));
    }
    // the table moves too and keeps its size, but its entry now records the new fragment size,
    // which is the whole point of rewriting it
    const tableBefore = sectionOf(image, "vendor_ramdisk_table");
    const tableAfter = sectionOf(produced, "vendor_ramdisk_table");
    expect(tableAfter?.offset ?? 0).toBeGreaterThan(tableBefore?.offset ?? 0);
    expect(tableAfter?.size).toBe(tableBefore?.size);
    expect(Array.from(tableAfter?.data ?? [])).not.toEqual(Array.from(tableBefore?.data ?? []));
    // the grown ramdisk still fits the partition, so the image keeps its size
    expect(outcome.bytes.length).toBe(image.totalSize);
    expect(outcome.warnings.join(" ")).toMatch(/changed by \+4096 bytes/);
  }, 180000);

  it("refuses a fragment index that does not exist", () => {
    const image = loadImage();
    expect(() => repackVendorBootImage({ image, fragments: [{ index: 7, data: new Uint8Array(8) }] })).toThrowError(
      /does not exist/,
    );
  }, 120000);
});
