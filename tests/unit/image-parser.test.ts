import { describe, expect, it } from "vitest";
import { assertBootImage, parseImage } from "@/core/image";
import { UnsupportedImageError } from "@/core/errors";
import { buildBootImage, buildVendorBootImage, deterministicBytes, makeKernel, makeRamdisk } from "../fixtures/bootimg";

describe("parseImage", () => {
  it("parses a v4 boot image and exposes every section", async () => {
    const kernel = makeKernel(4096);
    const ramdisk = await makeRamdisk(2048);
    const bytes = await buildBootImage({ kernel, ramdisk, cmdline: "console=ttyS0 androidboot.slot=a" });

    const image = assertBootImage(parseImage(bytes));

    expect(image.format).toBe("boot");
    expect(image.headerVersion).toBe(4);
    expect(image.pageSize).toBe(4096);
    expect(image.architecture).toBe("arm64");
    expect(image.cmdline).toBe("console=ttyS0 androidboot.slot=a");
    expect(image.header.kernelSize).toBe(kernel.length);
    expect(image.header.ramdiskSize).toBe(ramdisk.length);
    expect(Array.from(image.sections.map((section) => section.name))).toEqual(["kernel", "ramdisk"]);
    expect(Array.from(image.sections[0].data)).toEqual(Array.from(kernel));
    expect(Array.from(image.sections[1].data)).toEqual(Array.from(ramdisk));
  });

  it("classifies a v4 image without a kernel as init_boot", async () => {
    const ramdisk = await makeRamdisk(1024);
    const image = assertBootImage(parseImage(await buildBootImage({ headerVersion: 4, kernel: null, ramdisk })));
    expect(image.format).toBe("init_boot");
    expect(image.header.kernelSize).toBe(0);
  });

  it("parses the legacy v0 layout with page aligned sections", async () => {
    const kernel = makeKernel(3000);
    const ramdisk = await makeRamdisk(1500);
    const second = deterministicBytes(256, 5);
    const image = assertBootImage(
      parseImage(await buildBootImage({ headerVersion: 0, kernel, ramdisk, second, pageSize: 2048 })),
    );

    expect(image.headerVersion).toBe(0);
    expect(image.pageSize).toBe(2048);
    expect(image.header.kernelAddr).toBe(0x10008000);
    expect(image.header.secondSize).toBe(256);
    expect(image.header.idHex).toHaveLength(64);
    const kernelSection = image.sections.find((section) => section.name === "kernel");
    const ramdiskSection = image.sections.find((section) => section.name === "ramdisk");
    const secondSection = image.sections.find((section) => section.name === "second");
    expect(kernelSection?.offset).toBe(2048);
    expect(ramdiskSection?.offset).toBe(2048 + 4096);
    expect(secondSection?.offset).toBe(2048 + 4096 + 2048);
  });

  it("parses v1 recovery_dtbo and v2 dtb sections", async () => {
    const recoveryDtbo = deterministicBytes(300, 9);
    const dtb = deterministicBytes(700, 13);
    const v1 = assertBootImage(parseImage(await buildBootImage({ headerVersion: 1, recoveryDtbo })));
    const v2 = assertBootImage(parseImage(await buildBootImage({ headerVersion: 2, recoveryDtbo, dtb })));

    expect(v1.header.recoveryDtboSize).toBe(300);
    expect(v1.sections.find((section) => section.name === "recovery_dtbo")?.size).toBe(300);
    expect(v2.header.dtbSize).toBe(700);
    expect(v2.sections.find((section) => section.name === "dtb")?.size).toBe(700);
  });

  it("exposes the v4 AVB signature and bootconfig regions", async () => {
    const bootconfig = new TextEncoder().encode("androidboot.selinux=permissive\n");
    const image = assertBootImage(parseImage(await buildBootImage({ bootconfig, signatureSize: 4096 })));

    expect(image.header.signatureSize).toBe(4096);
    expect(image.sections.find((section) => section.name === "signature")?.size).toBe(4096);
    const config = image.sections.find((section) => section.name === "bootconfig");
    expect(config).toBeDefined();
    expect(new TextDecoder().decode(config?.data)).toContain("androidboot.selinux=permissive");
  });

  it("parses vendor_boot v4 ramdisk tables", async () => {
    const ramdisk = await makeRamdisk(1024);
    const image = parseImage(await buildVendorBootImage({ vendorRamdisk: ramdisk }));

    expect(image.format).toBe("vendor_boot");
    expect(image.headerVersion).toBe(4);
    if (image.format !== "vendor_boot") throw new Error("expected vendor_boot");
    expect(image.header.ramdiskTableEntryNum).toBe(1);
    expect(image.header.ramdiskTable[0].ramdiskName).toBe("default");
    expect(image.header.ramdiskTable[0].ramdiskTypeName).toBe("platform");
    expect(image.sections.find((section) => section.name === "vendor_ramdisk")?.size).toBe(ramdisk.length);
  });

  it("rejects unknown containers with a structured error", () => {
    expect(() => parseImage(deterministicBytes(4096, 3))).toThrowError(UnsupportedImageError);
    try {
      parseImage(deterministicBytes(4096, 3));
    } catch (error) {
      expect((error as UnsupportedImageError).code).toBe("UNSUPPORTED_IMAGE");
      expect((error as UnsupportedImageError).technical).toMatch(/Unrecognized image magic/);
      expect((error as UnsupportedImageError).message).toBe("This image format is not supported.");
    }
  });
});
