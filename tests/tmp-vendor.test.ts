import { readFileSync } from "node:fs";
import { it } from "vitest";
import { describeCompression, parseImage, sectionOf } from "@/core/image";

it(
  "inspect the real vendor_boot image",
  async () => {
    const bytes = new Uint8Array(readFileSync("/home/youxi/images/vendor_boot.img"));
    const image = parseImage(bytes);
    if (image.format !== "vendor_boot") throw new Error("not vendor_boot: " + image.format);
    console.log("MAGIC format=" + image.format + " v" + image.headerVersion + " page=" + image.pageSize + " total=" + image.totalSize);
    const header = image.header;
    console.log(
      "MAGIC vendor_ramdisk_size=" + header.vendorRamdiskSize + " table_size=" + header.ramdiskTableSize +
        " entries=" + header.ramdiskTableEntryNum + " entry_size=" + header.ramdiskTableEntrySize,
    );
    const region = sectionOf(image, "vendor_ramdisk")?.data ?? new Uint8Array();
    console.log("MAGIC region=" + region.length + " magic=" + Buffer.from(region.subarray(0, 4)).toString("hex"));
    for (const entry of header.ramdiskTable) {
      const fragment = region.subarray(entry.ramdiskOffset, entry.ramdiskOffset + entry.ramdiskSize);
      console.log(
        "MAGIC fragment name=" + JSON.stringify(entry.ramdiskName) + " type=" + entry.ramdiskTypeName +
          " offset=" + entry.ramdiskOffset + " size=" + entry.ramdiskSize +
          " compression=" + describeCompression(fragment).format,
      );
    }
    for (const section of image.sections) console.log("MAGIC section " + section.name + " offset=" + section.offset + " size=" + section.size);
    console.log("MAGIC warnings: " + image.warnings.join(" | ").slice(0, 200));
  },
  300000,
);
