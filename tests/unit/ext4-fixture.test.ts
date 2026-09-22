import { describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import { listExt4Directory, parseExt4, readExt4File, readExt4Inode, resolveExt4Path, EXT4_ROOT_INO } from "@/core/partition";
import { buildExt4Fixture } from "../fixtures/ext4";

describe("a synthetic ext4 image", () => {
  const fixture = buildExt4Fixture();
  const image = bytesSource(fixture.bytes);

  it("reads its superblock and a linear directory", async () => {
    const superblock = await parseExt4(image);
    expect(superblock.blockSize).toBe(1024);
    expect(superblock.inodeSize).toBe(128);
    expect(superblock.volumeName).toBe("imageforge-ext4");

    const root = await readExt4Inode(image, superblock, EXT4_ROOT_INO);
    const names = (await listExt4Directory(image, superblock, root)).map((entry) => entry.name);
    expect(names).toContain("hello.txt");
    expect(names).toContain("nested.bin");
    expect(names).toContain("indexed");
  });

  it("reads a file through a one block extent", async () => {
    const superblock = await parseExt4(image);
    const inode = await resolveExt4Path(image, superblock, "/hello.txt");
    const data = await readExt4File(image, superblock, inode);
    expect([...data]).toEqual([...fixture.helloContent]);
  });

  it("reads a file through an extent tree one level deep", async () => {
    const superblock = await parseExt4(image);
    const inode = await resolveExt4Path(image, superblock, "/nested.bin");
    expect(inode.size).toBe(fixture.nestedContent.length);
    const data = await readExt4File(image, superblock, inode);
    expect([...data]).toEqual([...fixture.nestedContent]);
  });

  it("lists a hash indexed directory through its index and leaves", async () => {
    const superblock = await parseExt4(image);
    const inode = await resolveExt4Path(image, superblock, "/indexed");
    expect(inode.flags & 0x1000).toBe(0x1000);
    const names = (await listExt4Directory(image, superblock, inode)).map((entry) => entry.name).sort();
    expect(names).toEqual([...fixture.indexedNames].sort());
  });
});
