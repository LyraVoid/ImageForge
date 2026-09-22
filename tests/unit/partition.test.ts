import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bytesSource, extractPackageEntry, openPackage } from "@/core/package";
import {
  EROFS_SUPER_OFFSET,
  logicalPartitionSource,
  parseErofs,
  parseSparse,
  parseSuper,
  readDirectory,
  readInode,
  readInodeData,
  resolveErofsPath,
  unpackSparse,
  inodeOffset,
} from "@/core/partition";
import { PackageError } from "@/core/errors";
import { buildSparse, sparseExpected } from "../fixtures/sparse";
import { buildSuper } from "../fixtures/super";
import { fileSource } from "../fixtures/file-source";

const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOtaPackage = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);

describe("sparse images", () => {
  const chunks = [
    { type: "raw" as const, blockCount: 2, data: new Uint8Array(8192).fill(0x41) },
    { type: "fill" as const, blockCount: 3, fillValue: 0xdeadbeef },
    { type: "dont-care" as const, blockCount: 2 },
    { type: "raw" as const, blockCount: 1, data: new Uint8Array(4096).fill(0x7f) },
  ];

  it("reads the header and the chunk list", async () => {
    const sparse = buildSparse(chunks);
    const parsed = await parseSparse(bytesSource(sparse));

    expect(parsed.header).toMatchObject({ majorVersion: 1, blockSize: 4096, totalBlocks: 8, totalChunks: 4 });
    expect(parsed.sizeBytes).toBe(8 * 4096);
    expect(parsed.chunks.map((chunk) => chunk.typeName)).toEqual(["RAW", "FILL", "DONT_CARE", "RAW"]);
    expect(parsed.chunks[1].fillValue).toBe(0xdeadbeef);
  });

  it("unpacks to the image the sparse file stands for", async () => {
    const sparse = buildSparse(chunks);
    const parsed = await parseSparse(bytesSource(sparse));

    const image = await unpackSparse(bytesSource(sparse), parsed);

    expect(image.length).toBe(sparseExpected(chunks).length);
    expect([...image]).toEqual([...sparseExpected(chunks)]);
  });

  it("refuses a file that is not sparse, and one whose checksum does not match", async () => {
    await expect(parseSparse(bytesSource(new Uint8Array(64)))).rejects.toThrowError(/not an Android sparse/);

    const sparse = buildSparse([{ type: "raw" as const, blockCount: 1, data: new Uint8Array(4096).fill(9) }]);
    sparse[sparse.length - 1] ^= 0xff;
    const parsed = await parseSparse(bytesSource(sparse));
    await expect(unpackSparse(bytesSource(sparse), parsed)).rejects.toThrowError(/checksum/);
  });

  it("refuses to unpack past its memory limit, and says so", async () => {
    const sparse = buildSparse([{ type: "dont-care" as const, blockCount: 4096 }]);
    const parsed = await parseSparse(bytesSource(sparse));

    await expect(unpackSparse(bytesSource(sparse), parsed, { limit: 1024 })).rejects.toThrowError(/too large/);
  });
});

describe("super images", () => {
  // Extents are sector granular (liblp counts 512 byte sectors), so the data a test feeds in is
  // sector aligned too: that is also what lpmake requires of its partition images.
  const systemData = new Uint8Array(3072).map((_, index) => index % 251);
  const vendorData = new Uint8Array(5120).map((_, index) => (index * 7) % 253);

  const build = () =>
    buildSuper([
      { name: "system", group: "qti_dynamic_partitions", extents: [{ data: systemData }] },
      {
        name: "vendor",
        group: "qti_dynamic_partitions",
        extents: [{ data: vendorData.subarray(0, 2048) }, { data: vendorData.subarray(2048) }],
      },
      { name: "userdata", extents: [{ data: null }] },
    ]);

  it("reads the metadata, the table checksums and the partitions", async () => {
    const { bytes } = await build();
    const parsed = await parseSuper(bytesSource(bytes));

    expect(parsed.headerVersion).toBe("10.2");
    expect(parsed.geometry).toMatchObject({ metadataMaxSize: 4096, metadataSlotCount: 2, logicalBlockSize: 4096 });
    expect(parsed.blockDevices[0]).toMatchObject({ name: "super", firstLogicalSector: 64 });
    expect(parsed.groups).toEqual(["qti_dynamic_partitions", "default"]);
    expect(parsed.partitions.map((partition) => partition.name)).toEqual(["system", "vendor", "userdata"]);
    const vendor = parsed.partitions.find((partition) => partition.name === "vendor");
    expect(vendor?.extents).toHaveLength(2);
    expect(parsed.partitions.find((partition) => partition.name === "system")?.readOnly).toBe(true);
  });

  it("reads a logical partition out of the image, across extents", async () => {
    const { bytes } = await build();
    const parsed = await parseSuper(bytesSource(bytes));
    const source = bytesSource(bytes);

    const system = await logicalPartitionSource(source, parsed, "system").read(0, systemData.length);
    expect([...system]).toEqual([...systemData]);

    const vendor = await logicalPartitionSource(source, parsed, "vendor").read(0, vendorData.length);
    expect([...vendor]).toEqual([...vendorData]);
    // only the part that was asked for is read, so an offset read lands inside the right extent
    const tail = await logicalPartitionSource(source, parsed, "vendor").read(2600, 100);
    expect([...tail]).toEqual([...vendorData.subarray(2600, 2700)]);

    // a dm-zero extent is a hole, not data
    const zero = await logicalPartitionSource(source, parsed, "userdata").read(0, 512);
    expect(zero.every((byte) => byte === 0)).toBe(true);
  });

  it("refuses a damaged geometry instead of reading garbage", async () => {
    const { bytes } = await build();
    const damaged = new Uint8Array(bytes);
    damaged[40] ^= 0xff; // the metadata max size, covered by the geometry checksum

    await expect(parseSuper(bytesSource(damaged))).rejects.toThrowError(/geometry checksum/);
  });

  it("refuses a file that is not a super image", async () => {
    await expect(parseSuper(bytesSource(new Uint8Array(8192)))).rejects.toThrowError(PackageError);
  });
});

describe.skipIf(!hasOtaPackage)("a real erofs partition", () => {
  it("lists and reads a real Android 16 erofs image out of an OTA package", async () => {
    const packageSource = fileSource(OTA_PACKAGE);
    const opened = await openPackage(packageSource);
    const entry = opened.entries.find((candidate) => candidate.id.endsWith("::product"));
    expect(entry).toBeDefined();

    const partition = await extractPackageEntry(packageSource, entry?.id as string);
    const image = bytesSource(partition);
    const superblock = await parseErofs(image);

    expect(superblock.blockSize).toBe(4096);
    expect(superblock.unknownFeatures).toBe(0);
    expect(inodeOffset(superblock, superblock.rootNid)).toBeGreaterThanOrEqual(EROFS_SUPER_OFFSET);

    const root = await readInode(image, superblock, superblock.rootNid);
    expect(root.isDirectory).toBe(true);
    const entries = await readDirectory(image, superblock, root);
    const names = entries.map((candidate) => candidate.name);
    expect(names).toContain("app");
    expect(names).toContain("framework");
    expect(names).toContain("etc");

    // Descending a real path works, and a file below it is either read or refused by name: system
    // images store most file data compressed, so both outcomes are legitimate and both are checked.
    const etc = await resolveErofsPath(image, superblock, "/etc");
    expect(etc.isDirectory).toBe(true);
    const etcEntries = await readDirectory(image, superblock, etc);
    expect(etcEntries.length).toBeGreaterThan(0);

    let flatRead = 0;
    let compressedRefused = 0;
    for (const candidate of etcEntries.slice(0, 64)) {
      const inode = await readInode(image, superblock, candidate.nid);
      if (inode.isDirectory) continue;
      if (inode.dataLayout === "flat" || inode.dataLayout === "flat-inline") {
        const data = await readInodeData(image, superblock, inode);
        expect(data.length).toBe(inode.size);
        flatRead += 1;
      } else {
        await expect(readInodeData(image, superblock, inode)).rejects.toThrowError(/compressed|chunks/);
        compressedRefused += 1;
      }
    }
    expect(flatRead + compressedRefused).toBeGreaterThan(0);

    await expect(resolveErofsPath(image, superblock, "/definitely-not-here")).rejects.toThrowError(
      /does not exist/,
    );
  }, 300000);
});
