import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bytesSource, listZip, parsePayload, payloadPartitionSource, storedEntrySource } from "@/core/package";
import { logicalPartitionSource, packSuper, parseSuper } from "@/core/partition";
import { sha256Hex } from "@/core/hash";
import { fileSource } from "../fixtures/file-source";

const LPMAKE = process.env.IMAGEFORGE_LPMAKE ?? "/usr/bin/lpmake";
const hasTools = existsSync(LPMAKE) && existsSync("/usr/bin/lpunpack") && existsSync("/usr/bin/lpdump");
const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOta = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);

function pattern(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) out[index] = (index * 7 + seed) % 256;
  return out;
}

describe("the super writer", () => {
  it("places partitions the way lpdump's layout describes and reads back", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-super-"));
    const systemPath = join(directory, "system.img");
    const vendorPath = join(directory, "vendor.img");
    const system = pattern(1024 * 1024, 3);
    const vendor = pattern(2 * 1024 * 1024, 11);
    writeFileSync(systemPath, system);
    writeFileSync(vendorPath, vendor);

    const image = await packSuper(
      [
        { name: "system", source: fileSource(systemPath), group: "main" },
        { name: "vendor", source: fileSource(vendorPath), group: "main" },
      ],
      { deviceSize: 8 * 1024 * 1024, groups: [{ name: "main", maximumSize: 8 * 1024 * 1024 }] },
    );
    expect(image.length).toBe(8 * 1024 * 1024);

    // our own reader sees the partitions where they were placed
    const parsed = await parseSuper(bytesSource(image));
    expect(parsed.partitions.map((entry) => entry.name)).toEqual(["system", "vendor"]);
    for (const [name, content] of [["system", system], ["vendor", vendor]] as const) {
      const logical = logicalPartitionSource(bytesSource(image), parsed, name);
      expect(logical.size, name).toBe(content.length);
      const read = new Uint8Array(await logical.read(0, content.length));
      expect(await sha256Hex(read), name).toBe(await sha256Hex(content));
    }
  });

  it("refuses names, duplicates and a device that is too small", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-super-"));
    const small = join(directory, "small.img");
    writeFileSync(small, pattern(4096, 1));

    await expect(packSuper([], {})).rejects.toThrowError(/Add at least one partition/);
    await expect(
      packSuper([{ name: "bad name", source: fileSource(small) }], {}),
    ).rejects.toThrowError(/letters, digits and underscores/);
    await expect(
      packSuper(
        [
          { name: "same", source: fileSource(small) },
          { name: "same", source: fileSource(small) },
        ],
        {},
      ),
    ).rejects.toThrowError(/unique/);
    await expect(
      packSuper([{ name: "system", source: fileSource(small) }], { deviceSize: 4096 }),
    ).rejects.toThrowError(/too small/);
  });
});

describe.skipIf(!hasTools)("against the AOSP tools", () => {
  it("matches lpmake byte for byte, and lpunpack gives the partitions back", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-super-tools-"));
    const systemPath = join(directory, "system.img");
    const vendorPath = join(directory, "vendor.img");
    const system = pattern(1024 * 1024, 3);
    const vendor = pattern(2 * 1024 * 1024, 11);
    writeFileSync(systemPath, system);
    writeFileSync(vendorPath, vendor);

    const referencePath = join(directory, "reference.img");
    execFileSync(LPMAKE, [
      "--device-size", String(8 * 1024 * 1024),
      "--metadata-size", "65536",
      "--metadata-slots", "2",
      "--group", "main:" + String(8 * 1024 * 1024),
      "--partition", "system:readonly:1048576:main", "--image", "system=" + systemPath,
      "--partition", "vendor:readonly:2097152:main", "--image", "vendor=" + vendorPath,
      "--output", referencePath,
    ]);
    const reference = new Uint8Array(readFileSync(referencePath));

    const ours = await packSuper(
      [
        { name: "system", source: fileSource(systemPath), group: "main" },
        { name: "vendor", source: fileSource(vendorPath), group: "main" },
      ],
      { deviceSize: 8 * 1024 * 1024, groups: [{ name: "main", maximumSize: 8 * 1024 * 1024 }] },
    );
    expect(await sha256Hex(ours)).toBe(await sha256Hex(reference));

    // AOSP's own dumper reads it, and its unpacker gives the partitions back
    const oursPath = join(directory, "ours.img");
    writeFileSync(oursPath, ours);
    const dump = execFileSync("lpdump", [oursPath], { encoding: "utf8" });
    expect(dump).toContain("Name: system");
    expect(dump).toContain("Name: vendor");
    expect(dump).toContain("Group: main");
    const unpacked = join(directory, "unpacked");
    execFileSync("mkdir", ["-p", unpacked]);
    execFileSync("lpunpack", [oursPath, unpacked]);
    expect(await sha256Hex(new Uint8Array(readFileSync(join(unpacked, "system.img"))))).toBe(await sha256Hex(system));
    expect(await sha256Hex(new Uint8Array(readFileSync(join(unpacked, "vendor.img"))))).toBe(await sha256Hex(vendor));
  }, 300000);

  it("matches lpmake when the alignment is small and a partition is writable", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-super-align-"));
    const aPath = join(directory, "a.img");
    const bPath = join(directory, "b.img");
    // 4096 is a multiple of the block size but not of the default 1 MiB alignment
    const a = pattern(4096 * 3, 5);
    const b = pattern(4096 * 5, 9);
    writeFileSync(aPath, a);
    writeFileSync(bPath, b);

    const referencePath = join(directory, "reference.img");
    execFileSync(LPMAKE, [
      "--device-size", String(1024 * 1024),
      "--metadata-size", "65536",
      "--metadata-slots", "1",
      "--alignment", "4096",
      "--group", "main:1048576",
      // AOSP's tool spells the writable case "none": no attributes set
      "--partition", "a:none:12288:main", "--image", "a=" + aPath,
      "--partition", "b:readonly:20480", "--image", "b=" + bPath,
      "--output", referencePath,
    ]);
    const reference = new Uint8Array(readFileSync(referencePath));

    const ours = await packSuper(
      [
        { name: "a", source: fileSource(aPath), group: "main", writable: true },
        { name: "b", source: fileSource(bPath) },
      ],
      {
        deviceSize: 1024 * 1024,
        metadataSlots: 1,
        alignment: 4096,
        groups: [{ name: "main", maximumSize: 1024 * 1024 }],
      },
    );
    expect(await sha256Hex(ours)).toBe(await sha256Hex(reference));
  }, 300000);

  it("writes the compact super_empty image lpmake writes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-super-empty-"));
    const referencePath = join(directory, "empty.img");
    // no --image: the partitions are declared by size, and lpmake writes metadata only
    execFileSync(LPMAKE, [
      "--device-size", String(8 * 1024 * 1024),
      "--metadata-size", "65536",
      "--metadata-slots", "2",
      "--group", "main:" + String(8 * 1024 * 1024),
      "--partition", "system:readonly:1048576:main",
      "--partition", "vendor:readonly:2097152:main",
      "--output", referencePath,
    ]);
    const reference = new Uint8Array(readFileSync(referencePath));
    expect(reference.length).toBe(4096 + 128 + 312);

    const ours = await packSuper(
      [
        { name: "system", sizeBytes: 1024 * 1024, group: "main" },
        { name: "vendor", sizeBytes: 2 * 1024 * 1024, group: "main" },
      ],
      {
        deviceSize: 8 * 1024 * 1024,
        groups: [{ name: "main", maximumSize: 8 * 1024 * 1024 }],
        metadataOnly: true,
      },
    );
    expect(ours.length).toBe(reference.length);
    expect(await sha256Hex(ours)).toBe(await sha256Hex(reference));

    const oursPath = join(directory, "ours-empty.img");
    writeFileSync(oursPath, ours);
    const dump = execFileSync("lpdump", [oursPath], { encoding: "utf8" });
    expect(dump).toContain("Name: system");
    expect(dump).toContain("Name: vendor");
    // the metadata still describes a full device, which is the point of the compact form
    expect(dump).toContain("Size: 8388608 bytes");
  }, 120000);

  it.skipIf(!hasOta)("packs real OTA partitions and lpunpack gets them back", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-super-real-"));
    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    const payload = await parsePayload(payloadSource);
    const names = ["splash", "system_dlkm"];
    const sources = names.map((name) => payloadPartitionSource(payloadSource, payload, name));
    for (const [index, name] of names.entries()) {
      expect(payload.partitions.find((partition) => partition.name === name), name).toBeDefined();
      // the sizes have to be a whole number of blocks for an exact round trip
      expect(sources[index].size % 4096, name).toBe(0);
    }

    const ours = await packSuper(
      names.map((name, index) => ({ name, source: sources[index], group: "main" })),
      {
        alignment: 4096,
        metadataSize: 65536,
        groups: [{ name: "main", maximumSize: 64 * 1024 * 1024 }],
      },
    );
    const oursPath = join(directory, "super.img");
    writeFileSync(oursPath, ours);
    const unpacked = join(directory, "unpacked");
    execFileSync("mkdir", ["-p", unpacked]);
    execFileSync("lpunpack", [oursPath, unpacked]);

    for (const [index, name] of names.entries()) {
      const expected = new Uint8Array(await sources[index].read(0, sources[index].size));
      const got = new Uint8Array(readFileSync(join(unpacked, name + ".img")));
      expect(got.length, name).toBe(expected.length);
      expect(await sha256Hex(got), name).toBe(await sha256Hex(expected));
    }
    console.log("real partitions packed:", names.join(", "), "->", ours.length, "bytes");
  }, 600000);
});
