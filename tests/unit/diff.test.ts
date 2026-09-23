import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import { bootSections, diffSources, sectionDiff } from "@/core/diff";
import { buildBootImage } from "../fixtures/bootimg";
import { fileSource } from "../fixtures/file-source";

const INIT_BOOT = process.env.IMAGEFORGE_INIT_BOOT ?? ".research/aster-validation/init_boot.img";
const hasInitBoot = existsSync(INIT_BOOT);

function withBytes(bytes: Uint8Array, changes: Array<[number, number]>): Uint8Array {
  const copy = new Uint8Array(bytes);
  for (const [offset, value] of changes) copy[offset] = value;
  return copy;
}

describe("comparing two images", () => {
  it("sees identical bytes as identical", async () => {
    const bytes = new Uint8Array(4096 * 3).map((_, index) => index % 251);
    const diff = await diffSources(bytesSource(bytes), bytesSource(new Uint8Array(bytes)));

    expect(diff.identical).toBe(true);
    expect(diff.ranges).toEqual([]);
    expect(diff.differingBytes).toBe(0);
    expect([diff.sizeA, diff.sizeB]).toEqual([bytes.length, bytes.length]);
  });

  it("points at the bytes that differ, and merges what is close together", async () => {
    const bytes = new Uint8Array(1 << 16);
    const one = withBytes(bytes, [[1000, 1]]);
    const diff = await diffSources(bytesSource(bytes), bytesSource(one));
    expect(diff.identical).toBe(false);
    expect(diff.ranges).toEqual([{ start: 1000, length: 1 }]);
    expect(diff.differingBytes).toBe(1);

    // two changes far apart are two ranges, two changes a few bytes apart are one
    const far = await diffSources(bytesSource(bytes), bytesSource(withBytes(bytes, [[1000, 1], [5000, 1]])));
    expect(far.ranges).toHaveLength(2);
    const close = await diffSources(bytesSource(bytes), bytesSource(withBytes(bytes, [[1000, 1], [1020, 1]])));
    expect(close.ranges).toEqual([{ start: 1000, length: 21 }]);
    expect(close.differingBytes).toBe(2);
  });

  it("counts the tail of a longer file, and caps the list without losing the count", async () => {
    const short = new Uint8Array(4096).fill(7);
    const long = new Uint8Array(4096 + 100).fill(7);
    const longer = await diffSources(bytesSource(short), bytesSource(long));
    expect(longer.ranges).toEqual([{ start: 4096, length: 100 }]);
    expect(longer.differingBytes).toBe(100);

    // 300 separate differences, a cap of 10 ranges: the count stays exact, the list does not
    const wide = new Uint8Array(64 * 1024).fill(7);
    const changes: Array<[number, number]> = [];
    for (let index = 0; index < 300; index += 1) changes.push([index * 100, 9]);
    const many = await diffSources(bytesSource(wide), bytesSource(withBytes(wide, changes)), {
      maxRanges: 10,
    });
    expect(many.truncated).toBe(true);
    expect(many.ranges.length).toBeLessThanOrEqual(10);
    expect(many.differingBytes).toBe(300);
  });
});

describe("saying which part of a boot image moved", () => {
  it("names the section a difference falls in", async () => {
    const image = await buildBootImage({});
    const sections = await bootSections(bytesSource(image));
    expect(sections).not.toBeNull();
    const ramdisk = (sections as Array<{ name: string; start: number; end: number }>).find(
      (section) => section.name === "ramdisk",
    );
    expect(ramdisk).toBeDefined();

    // change one byte inside the ramdisk and leave everything else alone
    const changed = withBytes(image, [[(ramdisk as { start: number }).start + 16, 0x5a]]);
    const diff = await diffSources(bytesSource(image), bytesSource(changed));
    const named = sectionDiff(diff.ranges, sections as never, image.length);
    const byName = new Map(named.map((section) => [section.name, section.differingBytes]));
    expect(byName.get("ramdisk")).toBe(1);
    expect(byName.get("kernel") ?? 0).toBe(0);
    expect(byName.get("header")).toBe(0);
    expect(byName.get("outside any section") ?? 0).toBe(0);
  });

  it("returns nothing for something that is not a boot image", async () => {
    expect(await bootSections(bytesSource(new Uint8Array(4096)))).toBeNull();
  });
});

describe.skipIf(!hasInitBoot)("the boot image a real device dumped", () => {
  it("puts a change inside the ramdisk exactly where it belongs", async () => {
    const source = fileSource(INIT_BOOT);
    const sections = await bootSections(source);
    expect(sections).not.toBeNull();
    const list = sections as Array<{ name: string; start: number; end: number }>;
    const ramdisk = list.find((section) => section.name === "ramdisk");
    expect(ramdisk).toBeDefined();
    expect((ramdisk as { end: number }).end - (ramdisk as { start: number }).start).toBeGreaterThan(1024 * 1024);

    // the real file is read in ranges: this source serves the same bytes with exactly one flipped
    const at = (ramdisk as { start: number }).start + 1024;
    const changed = {
      size: source.size,
      async read(offset: number, length: number): Promise<Uint8Array> {
        const bytes = new Uint8Array(await source.read(offset, length));
        if (offset <= at && at < offset + bytes.length) bytes[at - offset] ^= 0xff;
        return bytes;
      },
    };
    const diff = await diffSources(source, changed);
    const named = sectionDiff(diff.ranges, list, source.size);
    const byName = new Map(named.map((section) => [section.name, section.differingBytes]));
    expect(byName.get("ramdisk")).toBe(1);
    expect(byName.get("header")).toBe(0);
    expect(byName.get("kernel") ?? 0).toBe(0);
    console.log("real init_boot sections:", list.map((section) => section.name + " " + section.start + ".." + section.end).join(", "));
  }, 120000);
});
