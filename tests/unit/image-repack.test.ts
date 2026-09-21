import { describe, expect, it } from "vitest";
import { RepackError } from "@/core/errors";
import { assertBootImage, parseImage, repackBootImage, verifyImage } from "@/core/image";
import {
  buildBootImage,
  buildVendorBootImage,
  deterministicBytes,
  makeKernel,
  makeRamdisk,
} from "../fixtures/bootimg";

describe("repackBootImage", () => {
  it("round trips a v4 image with a replaced ramdisk", async () => {
    const original = parseImage(await buildBootImage({ kernel: makeKernel(4096), ramdisk: await makeRamdisk(2048) }));
    const replacement = await makeRamdisk(4096);

    const outcome = repackBootImage({ image: original, ramdisk: replacement, cmdline: "console=ttyS0 patched" });
    const reparsed = assertBootImage(parseImage(outcome.bytes));

    expect(reparsed.headerVersion).toBe(4);
    expect(reparsed.header.ramdiskSize).toBe(replacement.length);
    expect(reparsed.cmdline).toBe("console=ttyS0 patched");
    const ramdisk = reparsed.sections.find((section) => section.name === "ramdisk");
    expect(Array.from(ramdisk?.data ?? [])).toEqual(Array.from(replacement));
    expect(outcome.bytes.length % 4096).toBe(0);
  });

  it("drops the AVB signature and reports it", async () => {
    const original = parseImage(await buildBootImage({ signatureSize: 2048 }));
    const outcome = repackBootImage({ image: original, ramdisk: await makeRamdisk(1024) });
    const reparsed = assertBootImage(parseImage(outcome.bytes));

    expect(reparsed.header.signatureSize).toBe(0);
    expect(outcome.warnings.join(" ")).toMatch(/AVB signature was dropped/);
  });

  it("keeps legacy sections aligned and updates recovery_dtbo_offset", async () => {
    const recoveryDtbo = deterministicBytes(300, 9);
    const original = parseImage(await buildBootImage({ headerVersion: 2, recoveryDtbo }));
    const outcome = repackBootImage({ image: original, ramdisk: await makeRamdisk(2048) });
    const reparsed = assertBootImage(parseImage(outcome.bytes));

    expect(reparsed.header.recoveryDtboSize).toBe(300);
    const entry = outcome.layout.find((item) => item.name === "recovery_dtbo");
    expect(entry).toBeDefined();
    expect(reparsed.header.recoveryDtboOffset).toBe(entry?.offset);
    expect(reparsed.sections.find((section) => section.name === "recovery_dtbo")?.size).toBe(300);
  });

  it("can remove the ramdisk entirely", async () => {
    const original = parseImage(await buildBootImage({}));
    const outcome = repackBootImage({ image: original, ramdisk: null });
    const reparsed = assertBootImage(parseImage(outcome.bytes));
    expect(reparsed.header.ramdiskSize).toBe(0);
    expect(reparsed.sections.some((section) => section.name === "ramdisk")).toBe(false);
  });

  it("refuses to repack vendor_boot images", async () => {
    const vendor = parseImage(await buildVendorBootImage({}));
    const replacement = await makeRamdisk(512);
    expect(vendor.format).toBe("vendor_boot");
    expect(() => repackBootImage({ image: vendor, ramdisk: replacement })).toThrowError(RepackError);
    try {
      repackBootImage({ image: vendor, ramdisk: replacement });
    } catch (error) {
      expect((error as RepackError).code).toBe("REPACK_ERROR");
      expect((error as RepackError).technical).toMatch(/Vendor boot images are read-only/);
    }
  });
});

describe("verifyImage", () => {
  it("passes structural and hash expectations for a repacked image", async () => {
    const original = parseImage(await buildBootImage({}));
    const ramdisk = await makeRamdisk(3000);
    const outcome = repackBootImage({ image: original, ramdisk, cmdline: "console=ttyS0 imageforge.mock=1" });

    const verification = await verifyImage(outcome.bytes, {
      format: "boot",
      headerVersion: 4,
      cmdlineIncludes: "imageforge.mock=1",
    });

    expect(verification.valid).toBe(true);
    expect(verification.sha256).toHaveLength(64);
    expect(verification.checks.find((entry) => entry.id === "structure")?.status).toBe("pass");
    expect(verification.checks.find((entry) => entry.id === "ramdisk-payload")?.detail).toBe("GZip");
  });

  it("fails a hash mismatch", async () => {
    const bytes = await buildBootImage({});
    const verification = await verifyImage(bytes, { ramdiskSha256: "0".repeat(64) });
    expect(verification.valid).toBe(false);
    expect(verification.checks.find((entry) => entry.id === "ramdisk-hash")?.status).toBe("fail");
  });

  it("fails when the image is not a recognized container", async () => {
    const verification = await verifyImage(deterministicBytes(2048, 2));
    expect(verification.valid).toBe(false);
    expect(verification.checks.find((entry) => entry.id === "structure")?.status).toBe("fail");
  });
});
