import { describe, expect, it } from "vitest";
import { KNOWN_KMIS, kmiFromRelease, readKernelRelease } from "@/core/image";

describe("kernel release detection", () => {
  it("maps real device banners to a KMI", () => {
    expect(kmiFromRelease("6.6.118-android15-8-g46a034eca005-ab12345678")).toBe("android15-6.6");
    expect(kmiFromRelease("5.10.209-android12-9-00001-g000000000000-ab12345678")).toBe("android12-5.10");
    expect(kmiFromRelease("6.1.75-android14-11-g000000000000-ab12345678")).toBe("android14-6.1");
    expect(kmiFromRelease("6.12.30-android16-5-g000000000000-ab12345678")).toBe("android16-6.12");
  });

  it("refuses to guess when the banner names no Android release", () => {
    expect(kmiFromRelease("6.6.127-4k-g46a034eca005-dirty")).toBeUndefined();
    expect(kmiFromRelease("android15-6.6")).toBeUndefined();
    expect(kmiFromRelease("")).toBeUndefined();
  });

  it("reads the banner out of a kernel payload", () => {
    const banner = new TextEncoder().encode(
      "\u0000\u0000Linux version 6.6.118-android15-8-g46a034eca005-ab12345678 (kleaf@build) (Android clang) #1 SMP PREEMPT\n",
    );
    expect(readKernelRelease(banner)).toBe("6.6.118-android15-8-g46a034eca005-ab12345678");
    expect(readKernelRelease(new TextEncoder().encode("no banner here"))).toBeUndefined();
  });

  it("lists the known KMIs newest first", () => {
    expect(KNOWN_KMIS[0]).toBe("android17-6.18");
    expect(KNOWN_KMIS).toContain("android15-6.6");
  });
});
