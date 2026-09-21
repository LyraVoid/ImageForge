import { describe, expect, it } from "vitest";
import { RepackError } from "@/core/errors";
import { assertBootImage, parseImage, repackBootImage, sectionOf, verifyImage } from "@/core/image";
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

  it("zero pads the output when a target size is requested", async () => {
    const original = assertBootImage(parseImage(await buildBootImage({})));
    const target = original.totalSize + 8 * 4096;
    const outcome = repackBootImage({ image: original, padTo: target });

    expect(outcome.bytes.length).toBe(target);
    expect(outcome.warnings.join(" ")).toMatch(/zero padded/);
    expect(Array.from(outcome.bytes.subarray(target - 256)).every((byte) => byte === 0)).toBe(true);

    const reparsed = assertBootImage(parseImage(outcome.bytes));
    expect(reparsed.header.kernelSize).toBe(original.header.kernelSize);
    expect(reparsed.totalSize).toBe(target);
  });

  it("ignores a padding target smaller than the content", async () => {
    const original = parseImage(await buildBootImage({}));
    const outcome = repackBootImage({ image: original, padTo: 1024 });
    expect(outcome.bytes.length).toBeGreaterThan(1024);
    expect(outcome.warnings.join(" ")).not.toMatch(/zero padded/);
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
function avbTrailer(size = 256): Uint8Array {
  const blob = new Uint8Array(size);
  blob.set(new TextEncoder().encode("AVB0"), 0);
  for (let i = 4; i < size; i += 1) blob[i] = (i * 7) & 0xff;
  return blob;
}

describe("keeping the source signature bytes", () => {
  it("keeps them when asked", async () => {
    const bytes = await buildBootImage({ trailing: avbTrailer() });
    const image = assertBootImage(parseImage(bytes));
    const outcome = repackBootImage({ image, kernel: new Uint8Array(8192), keepSignature: true });

    expect(sectionOf(assertBootImage(parseImage(outcome.bytes)), "signature")).toBeDefined();
  });

  it("drops them instead of growing past the size the image has to fit", async () => {
    // layout: 4096 header + 1000 kernel, padded to 8192, plus 256 signature bytes
    const bytes = await buildBootImage({ kernel: new Uint8Array(1000), ramdisk: null, trailing: avbTrailer() });
    const image = assertBootImage(parseImage(bytes));
    expect(bytes.length).toBe(8192 + 256);

    const outcome = repackBootImage({
      image,
      kernel: new Uint8Array(1000),
      keepSignature: true,
      padTo: 8300,
    });

    // 8192 fits into 8300, 8192 + 256 does not, so the stale bytes are dropped
    expect(outcome.bytes.length).toBe(8300);
    expect(sectionOf(assertBootImage(parseImage(outcome.bytes)), "signature")).toBeUndefined();
    expect(outcome.warnings.join(" ")).toMatch(/signature bytes were dropped/);
  });
});
