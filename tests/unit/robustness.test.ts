import { beforeAll, describe, expect, it } from "vitest";
import { bytesSource, listZip, parsePayload, readZipEntry } from "@/core/package";
import { parseErofs, parseExt4, parseSparse, parseSuper, readInodeData, resolveErofsPath } from "@/core/partition";
import { decodeBootHeader, decodeVendorBootHeader } from "@/core/image/bootimage/header";
import { detectArtifact } from "@/core/workspace/detect";
import { parseMtkLogo, parseSplash } from "@/core";
import { packAnimation, readAnimationZip } from "@/core/animation";
import { sha256Hex } from "@/core/hash";
import { buildBootImage, buildVendorBootImage } from "../fixtures/bootimg";
import { buildErofsFixture } from "../fixtures/erofs";
import { buildExt4Fixture } from "../fixtures/ext4";
import { buildMtkLogo } from "../fixtures/mtk-logo";
import { buildPayload } from "../fixtures/payload";
import { buildSparse } from "../fixtures/sparse";
import { buildSplash } from "../fixtures/splash";
import { buildSuper } from "../fixtures/super";
import { buildZip } from "../fixtures/zip";

/**
 * The property this file exists to hold: a reader either understands a file or refuses it with an
 * error of its own. It must never crash with a TypeError, never hang, and never quietly return
 * something that is not what the file says. Run against truncated and byte-flipped copies of every
 * fixture, that is what says whether the promise holds.
 */
interface Subject {
  name: string;
  bytes: Uint8Array;
  parse: (bytes: Uint8Array) => Promise<unknown>;
  /** When the parse still succeeds, this must agree with the whole file: nothing was lost. */
  fingerprint?: (bytes: Uint8Array) => Promise<string>;
}

function ours(error: unknown): string | null {
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  if (candidate && typeof candidate.code === "string" && typeof candidate.name === "string") return null;
  return (error as Error)?.message ?? String(error);
}

function truncationPoints(size: number): number[] {
  const points = [1, 8, 12, 54, 64, 128, 512, 4096, size - 1, size - 64, Math.floor(size / 2)];
  return [...new Set(points.filter((point) => point > 0 && point < size))];
}

function flipPoints(size: number): number[] {
  const points = [0, 3, 4, 8, 16, 40, 100, 1000, Math.floor(size / 2)];
  return [...new Set(points.filter((point) => point >= 0 && point < size))];
}

const subjects: Subject[] = [];

beforeAll(async () => {
  const boot = await buildBootImage({});
  const vendor = await buildVendorBootImage({});
  const zip = await buildZip([
    { name: "one.txt", data: new TextEncoder().encode("first") },
    { name: "two.bin", data: new Uint8Array([1, 2, 3, 4, 5]) },
  ]);
  const payload = await buildPayload([
    { name: "init_boot", data: boot, compress: "xz" },
    { name: "system", data: new Uint8Array(4096 * 3).fill(9), compress: "none" },
  ]);
  const sparse = buildSparse([
    { type: "raw", blockCount: 2, data: new Uint8Array(8192).fill(0x41) },
    { type: "fill", blockCount: 1, fillValue: 0x11223344 },
  ]);
  const superImage = (
    await buildSuper([{ name: "system", extents: [{ data: new Uint8Array(4096 * 2).fill(3) }] }])
  ).bytes;
  const erofs = buildErofsFixture();
  const ext4 = buildExt4Fixture();
  const splash = await buildSplash([{ name: "boot", width: 8, height: 4, color: [1, 2, 3] }]);
  const mtk = await buildMtkLogo([
    { width: 100, height: 60, layout: { bytesPerPixel: 4, stride: 400, prefixBytes: 0 }, rgba: new Uint8Array(100 * 60 * 4).fill(7) },
  ]);
  const animation = await packAnimation([
    { name: "desc.txt", data: new TextEncoder().encode("8 4 24\np 0 0 part0\n") },
    { name: "part0/a.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) },
  ]);

  subjects.push(
    {
      name: "zip",
      bytes: zip,
      parse: async (bytes) => listZip(bytesSource(bytes)),
      fingerprint: async (bytes) => {
        const entries = await listZip(bytesSource(bytes));
        const first = entries[0];
        const data = first ? await readZipEntry(bytesSource(bytes), first) : new Uint8Array(0);
        return entries.map((entry) => entry.name).join(",") + ":" + (await sha256Hex(data));
      },
    },
    {
      name: "payload",
      bytes: payload,
      parse: async (bytes) => parsePayload(bytesSource(bytes)),
      fingerprint: async (bytes) => {
        const parsed = await parsePayload(bytesSource(bytes));
        return parsed.partitions.map((partition) => partition.name + "/" + partition.operations.length).join(",");
      },
    },
    {
      name: "sparse",
      bytes: sparse,
      parse: async (bytes) => parseSparse(bytesSource(bytes)),
      fingerprint: async (bytes) => {
        const parsed = await parseSparse(bytesSource(bytes));
        return parsed.header.totalBlocks + "/" + parsed.chunks.length;
      },
    },
    {
      name: "super",
      bytes: superImage,
      parse: async (bytes) => parseSuper(bytesSource(bytes)),
      fingerprint: async (bytes) => {
        const parsed = await parseSuper(bytesSource(bytes));
        return parsed.partitions.map((partition) => partition.name + "@" + partition.extents.length).join(",");
      },
    },
    {
      name: "erofs",
      bytes: erofs.bytes,
      parse: async (bytes) => {
        const parsed = await parseErofs(bytesSource(bytes));
        const inode = await resolveErofsPath(bytesSource(bytes), parsed, erofs.paths.flat);
        return readInodeData(bytesSource(bytes), parsed, inode);
      },
      fingerprint: async (bytes) => {
        const parsed = await parseErofs(bytesSource(bytes));
        const inode = await resolveErofsPath(bytesSource(bytes), parsed, erofs.paths.flat);
        return await sha256Hex(await readInodeData(bytesSource(bytes), parsed, inode));
      },
    },
    {
      name: "ext4",
      bytes: ext4.bytes,
      parse: async (bytes) => parseExt4(bytesSource(bytes)),
      fingerprint: async (bytes) => {
        const parsed = await parseExt4(bytesSource(bytes));
        return parsed.blockSize + "/" + parsed.inodesCount;
      },
    },
    {
      name: "boot header",
      bytes: boot,
      parse: async (bytes) => decodeBootHeader(bytes.subarray(0, Math.min(bytes.length, 4096))),
      fingerprint: async (bytes) => {
        const header = decodeBootHeader(bytes.subarray(0, Math.min(bytes.length, 4096)));
        return [header.kernelSize, header.ramdiskSize, header.headerVersion, header.pageSize].join("/");
      },
    },
    {
      name: "vendor boot header",
      bytes: vendor,
      parse: async (bytes) => decodeVendorBootHeader(bytes.subarray(0, Math.min(bytes.length, 4096))),
      fingerprint: async (bytes) => {
        const header = decodeVendorBootHeader(bytes.subarray(0, Math.min(bytes.length, 4096)));
        return [header.headerVersion, header.pageSize, header.vendorRamdiskSize, header.dtbSize].join("/");
      },
    },
    {
      name: "splash",
      bytes: splash,
      parse: async (bytes) => parseSplash(bytesSource(bytes)),
      fingerprint: async (bytes) => {
        const parsed = await parseSplash(bytesSource(bytes));
        return parsed.frames.map((frame) => frame.name + "/" + frame.realSize).join(",");
      },
    },
    {
      name: "mediaTek logo",
      bytes: mtk,
      parse: async (bytes) => parseMtkLogo(bytesSource(bytes), { width: 100, height: 60 }),
      fingerprint: async (bytes) => {
        const parsed = await parseMtkLogo(bytesSource(bytes), { width: 100, height: 60 });
        return parsed.frames.map((frame) => frame.rawSize + "/" + frame.compressedSize).join(",");
      },
    },
    {
      name: "animation",
      bytes: animation,
      parse: async (bytes) => readAnimationZip(bytesSource(bytes)),
      fingerprint: async (bytes) => {
        const read = await readAnimationZip(bytesSource(bytes));
        return read.desc + "|" + read.entries.map((entry) => entry.name).join(",");
      },
    },
  );
});

describe("damaged input", () => {
  it("either reads a truncated file or refuses it with an error of its own", async () => {
    const problems: string[] = [];
    let parsed = 0;
    let refused = 0;
    for (const subject of subjects) {
      for (const at of truncationPoints(subject.bytes.length)) {
        const truncated = subject.bytes.slice(0, at);
        try {
          await subject.parse(truncated);
          parsed += 1;
          // it parsed: then it must have understood everything the whole file says
          if (subject.fingerprint) {
            const before = await subject.fingerprint(subject.bytes);
            const after = await subject.fingerprint(truncated);
            if (before !== after) problems.push(subject.name + " @" + at + ": parsed but lost something");
          }
        } catch (error) {
          refused += 1;
          const foreign = ours(error);
          if (foreign !== null) problems.push(subject.name + " @" + at + ": " + foreign);
        }
      }
    }
    console.log("truncations: " + parsed + " read, " + refused + " refused, across " + subjects.length + " formats");
    // a suite that never refuses anything would pass without testing the property at all
    expect(refused).toBeGreaterThan(20);
    expect(problems, problems.join("\n")).toEqual([]);
  }, 300000);

  it("never crashes with something that is not its own error when a byte is flipped", async () => {
    const problems: string[] = [];
    for (const subject of subjects) {
      for (const at of flipPoints(subject.bytes.length)) {
        const flipped = new Uint8Array(subject.bytes);
        flipped[at] ^= 0xff;
        try {
          await subject.parse(flipped);
        } catch (error) {
          const foreign = ours(error);
          if (foreign !== null) problems.push(subject.name + " @" + at + ": " + foreign);
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  }, 300000);

  it("still recognises the fixtures themselves", async () => {
    for (const subject of subjects) {
      expect(detectArtifact(subject.bytes.subarray(0, 8192)).kind, subject.name).toBeDefined();
      if (subject.fingerprint) {
        expect(await subject.fingerprint(subject.bytes), subject.name).toBe(await subject.fingerprint(subject.bytes));
      }
    }
  });
});
