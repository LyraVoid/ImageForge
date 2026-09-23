import { describe, expect, it } from "vitest";
import { buildImageReport, parseImage } from "@/core/image";
import { buildBootImage, makeRamdisk } from "../fixtures/bootimg";
import { buildRamdisk } from "../fixtures/cpio";

const encoder = new TextEncoder();

describe("existing patch detection", () => {
  it("finds nothing in a clean image", async () => {
    const report = await buildImageReport(
      parseImage(await buildBootImage({ ramdisk: buildRamdisk([{ name: "init" }]) })),
    );
    expect(report.existingPatch).toBeUndefined();
  });

  it("recognises a KernelSU ramdisk", async () => {
    const ramdisk = buildRamdisk([
      { name: "init" },
      { name: "init.real" },
      { name: "kernelsu.ko", mode: 0o100755 },
    ]);
    const report = await buildImageReport(parseImage(await buildBootImage({ ramdisk })));

    expect(report.existingPatch?.join(" ")).toMatch(/KernelSU: kernelsu.ko/);
    expect(report.existingPatch?.join(" ")).toMatch(/init.real/);
  });

  it("recognises a Magisk ramdisk", async () => {
    const ramdisk = buildRamdisk([
      { name: "init" },
      { name: "overlay.d/sbin/magisk.xz" },
      { name: ".backup/.magisk" },
    ]);
    const report = await buildImageReport(parseImage(await buildBootImage({ ramdisk })));

    expect(report.existingPatch?.join(" ")).toMatch(/Magisk/);
  });

  it("recognises a KernelPatch kernel", async () => {
    const kernel = encoder.encode("\u0000\u0000KP1158\u0001\u0000\u0000Linux version 6.6.118-android15-x\n");
    const report = await buildImageReport(
      parseImage(await buildBootImage({ kernel, ramdisk: buildRamdisk([{ name: "init" }]) })),
    );

    expect(report.existingPatch?.join(" ")).toMatch(/KernelPatch \(APatch or one of its forks\)/);
  });

  it("does not claim to read a compressed kernel", async () => {
    const report = await buildImageReport(parseImage(await buildBootImage({ ramdisk: await makeRamdisk() })));
    expect(report.existingPatch?.join(" ") ?? "").not.toMatch(/KernelPatch/);
  });
});
