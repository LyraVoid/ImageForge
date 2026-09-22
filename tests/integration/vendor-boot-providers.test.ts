import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CATALOG,
  KERNELSU_INIT_BACKUP_ENTRY,
  KERNELSU_INIT_ENTRY,
  KERNELSU_KMI_SETTING,
  KERNELSU_MODULE_ENTRY,
  MAGISK_CONFIG_ENTRY,
  MAGISK_INIT_ENTRY,
  MAGISK_MAGISK_ENTRY,
  createArtifactRegistry,
  createPatchEngine,
} from "@/core";
import { decodeRamdisk, findEntry, parseImage, sectionOf } from "@/core/image";
import { buildRamdisk } from "../fixtures/cpio";
import { buildVendorBootImage } from "../fixtures/bootimg";
import { fsPayloadLoader, hasVendorBootImage, readVendorBootImage } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;
const KMI = "android15-6.6";

function platformRamdisk(entries: Array<{ name: string; data?: string; mode?: number }>): Uint8Array {
  return buildRamdisk(entries);
}

async function fragmentArchive(imageBytes: Uint8Array) {
  const image = parseImage(imageBytes);
  if (image.format !== "vendor_boot") throw new Error("not a vendor boot image");
  const region = sectionOf(image, "vendor_ramdisk");
  if (!region) throw new Error("no vendor ramdisk");
  const entry = image.header.ramdiskTable[0];
  if (!entry) throw new Error("no fragment");
  const fragment = region.data.subarray(entry.ramdiskOffset, entry.ramdiskOffset + entry.ramdiskSize);
  return (await decodeRamdisk(fragment)).archive;
}

describe("ramdisk providers on vendor boot images", () => {
  it("offers KernelSU and Magisk for a vendor boot image", async () => {
    const bytes = await buildVendorBootImage({
      vendorRamdisk: platformRamdisk([{ name: "init", data: "stock init", mode: 0o100750 }]),
    });
    const analyzed = await engine.analyze(bytes);

    for (const id of ["kernelsu", "magisk"]) {
      expect(analyzed.compatibility.candidates.find((entry) => entry.providerId === id)?.compatible).toBe(true);
    }
  }, TIMEOUT);

  it(
    "patches the platform fragment of a vendor boot image with KernelSU",
    async () => {
      const bytes = await buildVendorBootImage({
        vendorRamdisk: platformRamdisk([
          { name: "init", data: "stock init", mode: 0o100750 },
          { name: "dev/null", mode: 0o020666 },
        ]),
      });
      const analyzed = await engine.analyze(bytes);
      const module = new Uint8Array(200000);
      module.set([0x7f, 0x45, 0x4c, 0x46]);

      const outcome = await engine.run(
        analyzed.image,
        analyzed.sha256,
        "kernelsu",
        { configuration: { [KERNELSU_KMI_SETTING]: KMI } },
        { attachments: [{ id: "kernelsu.ko", name: "kernelsu.ko", bytes: buildKernelSuModuleFixture() }] },
      );

      expect(outcome.result.metadata.target).toBe("vendor_boot");
      expect(outcome.result.metadata.targetRamdisk).toMatch(/vendor fragment 0 \(platform\)/);
      expect(outcome.verification.verification.valid).toBe(true);

      const produced = parseImage(outcome.result.bytes);
      if (produced.format !== "vendor_boot") throw new Error("the output is not a vendor boot image");
      // the rest of the image is untouched: the dtb and the bootconfig keep their bytes, and the
      // table keeps its shape while recording the new fragment size (which is the point)
      const before = parseImage(bytes);
      if (before.format !== "vendor_boot") throw new Error("bad fixture");
      for (const name of ["dtb", "bootconfig"] as const) {
        expect(Array.from(sectionOf(produced, name)?.data ?? [])).toEqual(Array.from(sectionOf(before, name)?.data ?? []));
      }
      expect(produced.header.ramdiskTable).toHaveLength(before.header.ramdiskTable.length);
      expect(produced.header.ramdiskTable[0]?.ramdiskType).toBe(1);
      // and the platform fragment now carries KernelSU
      const archive = await fragmentArchive(outcome.result.bytes);
      expect(findEntry(archive, KERNELSU_MODULE_ENTRY)).toBeDefined();
      expect(findEntry(archive, KERNELSU_INIT_BACKUP_ENTRY)).toBeDefined();
      expect(findEntry(archive, KERNELSU_INIT_ENTRY)?.data.length).toBeGreaterThan(100000);
    },
    TIMEOUT,
  );

  it(
    "patches the platform fragment of a vendor boot image with Magisk",
    async () => {
      const bytes = await buildVendorBootImage({
        vendorRamdisk: platformRamdisk([{ name: "init", data: "stock init", mode: 0o100750 }]),
      });
      const analyzed = await engine.analyze(bytes);
      const outcome = await engine.run(analyzed.image, analyzed.sha256, "magisk", {});

      expect(outcome.result.metadata.target).toBe("vendor_boot");
      expect(outcome.verification.verification.valid).toBe(true);

      const archive = await fragmentArchive(outcome.result.bytes);
      expect(findEntry(archive, MAGISK_INIT_ENTRY)?.data.length).toBe(199960);
      expect(findEntry(archive, MAGISK_MAGISK_ENTRY)).toBeDefined();
      expect(findEntry(archive, MAGISK_CONFIG_ENTRY)).toBeDefined();
    },
    TIMEOUT,
  );
});

/** Builds the module a KernelSU provider expects: a relocatable aarch64 ELF with name=kernelsu. */
function buildKernelSuModuleFixture(): Uint8Array {
  const info = [
    "license=GPL",
    "vermagic=6.6.127-4k-g46a034eca005-dirty SMP preempt mod_unload modversions aarch64",
    "name=kernelsu",
    "depends=",
  ].join("\0") + "\0";
  const payload = new TextEncoder().encode(info);
  const shstrtab = new TextEncoder().encode("\0.shstrtab\0.modinfo\0");
  const payloadOffset = 64;
  const shstrtabOffset = payloadOffset + payload.length;
  const shoff = shstrtabOffset + shstrtab.length;
  const total = shoff + 3 * 64;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
  view.setUint16(16, 1, true);
  view.setUint16(18, 183, true);
  view.setBigUint64(40, BigInt(shoff), true);
  view.setUint16(58, 64, true);
  view.setUint16(60, 3, true);
  view.setUint16(62, 1, true);
  out.set(payload, payloadOffset);
  out.set(shstrtab, shstrtabOffset);
  const section = (index: number, name: number, type: number, flags: bigint, offset: number, size: number): void => {
    const base = shoff + index * 64;
    view.setUint32(base, name, true);
    view.setUint32(base + 4, type, true);
    view.setBigUint64(base + 8, flags, true);
    view.setBigUint64(base + 24, BigInt(offset), true);
    view.setBigUint64(base + 32, BigInt(size), true);
  };
  section(0, 0, 0, 0n, 0, 0);
  section(1, 1, 3, 0n, shstrtabOffset, shstrtab.length);
  section(2, 11, 1, 2n, payloadOffset, payload.length);
  return out;
}

describe.skipIf(!hasVendorBootImage)("vendor boot images from a real device", () => {
  it(
    "installs Magisk into the platform fragment of a 96 MiB partition image",
    async () => {
      const source = readVendorBootImage();
      const analyzed = await engine.analyze(source);
      expect(analyzed.image.format).toBe("vendor_boot");
      if (analyzed.image.format !== "vendor_boot") throw new Error("not vendor boot");
      expect(analyzed.image.header.ramdiskTable).toHaveLength(1);
      expect(analyzed.image.header.ramdiskTable[0]?.ramdiskTypeName).toBe("platform");

      const outcome = await engine.run(analyzed.image, analyzed.sha256, "magisk", {
        configuration: { preserveImageSize: "true" },
      });

      expect(outcome.result.metadata.targetRamdisk).toMatch(/vendor fragment 0 \(platform\)/);
      expect(outcome.verification.verification.valid).toBe(true);
      expect(outcome.result.bytes.length).toBe(source.length);

      const archive = await fragmentArchive(outcome.result.bytes);
      expect(findEntry(archive, MAGISK_INIT_ENTRY)?.data.length).toBe(199960);
      expect(findEntry(archive, MAGISK_MAGISK_ENTRY)).toBeDefined();

      // the dtb, the table and the bootconfig survived, and the table records the new fragment size
      const produced = parseImage(outcome.result.bytes);
      const before = parseImage(source);
      if (produced.format !== "vendor_boot" || before.format !== "vendor_boot") throw new Error("bad parse");
      for (const name of ["dtb", "bootconfig"] as const) {
        expect(Array.from(sectionOf(produced, name)?.data ?? [])).toEqual(Array.from(sectionOf(before, name)?.data ?? []));
      }
      expect(produced.header.ramdiskTable[0]?.ramdiskSize).toBeGreaterThan(
        before.header.ramdiskTable[0]?.ramdiskSize ?? 0,
      );
    },
    TIMEOUT,
  );
});
