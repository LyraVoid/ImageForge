import { describe, expect, it } from "vitest";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { buildBootImage } from "../fixtures/bootimg";

function avbBlob(size = 256): Uint8Array {
  const blob = new Uint8Array(size);
  blob.set(new TextEncoder().encode("AVB0"), 0);
  for (let i = 4; i < size; i += 1) blob[i] = (i * 7) & 0xff;
  return blob;
}

describe("v4 trailing region classification", () => {
  it("reports an AVB blob after the kernel as a signature, not as bootconfig", async () => {
    const bytes = await buildBootImage({ trailing: avbBlob() });
    const image = assertBootImage(parseImage(bytes));

    expect(image.header.signatureSize).toBe(0);
    expect(sectionOf(image, "bootconfig")).toBeUndefined();
    const signature = sectionOf(image, "signature");
    expect(signature).toBeDefined();
    expect(new TextDecoder().decode((signature?.data ?? new Uint8Array()).subarray(0, 4))).toBe("AVB0");
    expect(image.warnings.join(" ")).toMatch(/AVB vbmeta blob/);
  });

  it("reports all zero trailing bytes as padding", async () => {
    const bytes = await buildBootImage({ trailing: new Uint8Array(8192) });
    const image = assertBootImage(parseImage(bytes));

    expect(sectionOf(image, "bootconfig")).toBeUndefined();
    expect(sectionOf(image, "signature")).toBeUndefined();
    expect(image.warnings.join(" ")).toMatch(/padding/);
  });

  it("still reports a real bootconfig section", async () => {
    const bootconfig = new TextEncoder().encode("androidboot.selinux=permissive\n");
    const image = assertBootImage(parseImage(await buildBootImage({ bootconfig })));

    const section = sectionOf(image, "bootconfig");
    expect(section).toBeDefined();
    expect(new TextDecoder().decode(section?.data ?? new Uint8Array())).toContain("androidboot.selinux");
  });

  it("keeps the declared signature when signature_size is set", async () => {
    const image = assertBootImage(parseImage(await buildBootImage({ signatureSize: 1024 })));
    expect(image.header.signatureSize).toBe(1024);
    expect(sectionOf(image, "signature")?.size).toBe(1024);
  });
});
