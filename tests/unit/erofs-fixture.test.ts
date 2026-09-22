import { describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import { parseErofs, readDirectory, readInodeData, resolveErofsPath } from "@/core/partition";
import { buildErofsFixture } from "../fixtures/erofs";

describe("a synthetic erofs image", () => {
  const fixture = buildErofsFixture();
  const image = bytesSource(fixture.bytes);

  it("reads its superblock and root directory", async () => {
    const superblock = await parseErofs(image);
    expect(superblock.blockSize).toBe(4096);
    expect(superblock.rootNid).toBe(36);
    expect(superblock.featureIncompat & 0x1).toBe(1);

    const root = await resolveErofsPath(image, superblock, "/");
    const names = (await readDirectory(image, superblock, root)).map((entry) => entry.name);
    expect(names).toEqual(["big.bin", "hello.txt"]);
  });

  it("reads a file stored flat", async () => {
    const superblock = await parseErofs(image);
    const inode = await resolveErofsPath(image, superblock, fixture.paths.flat);
    expect(inode.dataLayout).toBe("flat");
    const data = await readInodeData(image, superblock, inode);
    expect([...data]).toEqual([...fixture.flatFile]);
  });

  it("reads a file stored as LZ4 compressed clusters", async () => {
    const superblock = await parseErofs(image);
    const inode = await resolveErofsPath(image, superblock, fixture.paths.compressed);
    expect(inode.dataLayout).toBe("compressed-compact");
    const data = await readInodeData(image, superblock, inode);
    expect(data.length).toBe(fixture.compressedFile.length);
    expect([...data]).toEqual([...fixture.compressedFile]);
  });
});
