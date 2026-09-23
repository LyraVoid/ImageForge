import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import { CHUNK_TYPE_FILL, SPARSE_HEADER_SIZE, packSparse, parseSparse, unpackSparse } from "@/core/partition";
import { sha256Hex } from "@/core/hash";

const BLOCK = 4096;
const IMG2SIMG = process.env.IMAGEFORGE_IMG2SIMG ?? "/usr/bin/img2simg";
const tools = existsSync(IMG2SIMG);

function blocks(spec: Array<["same", number, number] | ["zero", number] | ["data", number, number]>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const entry of spec) {
    if (entry[0] === "same") {
      for (let count = 0; count < entry[2]; count += 1) parts.push(new Uint8Array(BLOCK).fill(entry[1]));
    } else if (entry[0] === "zero") {
      for (let count = 0; count < entry[1]; count += 1) parts.push(new Uint8Array(BLOCK));
    } else {
      for (let count = 0; count < entry[2]; count += 1) {
        const block = new Uint8Array(BLOCK);
        for (let index = 0; index < BLOCK; index += 1) block[index] = (index * 7 + entry[1]) % 256;
        parts.push(block);
      }
    }
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe("the sparse writer", () => {
  it("writes an image its own reader unpacks back to the same bytes", async () => {
    const input = blocks([["data", 3, 2], ["zero", 3], ["same", 0xab, 2]]);
    const sparse = await packSparse(bytesSource(input));

    const parsed = await parseSparse(bytesSource(sparse));
    expect(parsed.header.blockSize).toBe(BLOCK);
    expect(parsed.header.totalBlocks).toBe(7);
    const unpacked = await unpackSparse(bytesSource(sparse), await parseSparse(bytesSource(sparse)));
    expect(unpacked.length).toBe(input.length);
    expect(await sha256Hex(unpacked)).toBe(await sha256Hex(input));
  });

  it("makes zero and uniform runs small", async () => {
    const input = blocks([["same", 0xab, 64], ["zero", 128], ["same", 0xcd, 64]]);
    const sparse = await packSparse(bytesSource(input));

    // three chunks and a 28 byte header, the same shape img2simg produces
    expect(sparse.length).toBe(SPARSE_HEADER_SIZE + 16 + 16 + 16);
    const parsed = await parseSparse(bytesSource(sparse));
    expect(parsed.chunks.map((chunk) => chunk.type)).toEqual([CHUNK_TYPE_FILL, CHUNK_TYPE_FILL, CHUNK_TYPE_FILL]);
    expect(await sha256Hex(await unpackSparse(bytesSource(sparse), await parseSparse(bytesSource(sparse))))).toBe(await sha256Hex(input));
  });

  it.skipIf(!tools)("agrees with img2simg byte for byte", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-sparse-"));
    const cases: Record<string, Uint8Array> = {
      "data zero data": blocks([["data", 1, 2], ["zero", 3], ["data", 9, 2]]),
      "fills": blocks([["same", 0xab, 3], ["same", 0xcd, 2]]),
      "zero then uniform zero": blocks([["zero", 2], ["same", 0, 1]]),
      "one data block": blocks([["data", 3, 1]]),
      "many mixed": blocks([["data", 5, 5], ["zero", 1], ["same", 0x11, 4], ["data", 7, 3]]),
    };
    for (const [name, input] of Object.entries(cases)) {
      const rawPath = join(directory, "case.img");
      const referencePath = join(directory, "case.sparse");
      writeFileSync(rawPath, input);
      execFileSync(IMG2SIMG, [rawPath, referencePath, String(BLOCK)]);
      const reference = new Uint8Array(readFileSync(referencePath));
      const ours = await packSparse(bytesSource(input));
      expect(await sha256Hex(ours), name).toBe(await sha256Hex(reference));
    }
  });

  it.skipIf(!tools)("what img2simg writes, we unpack, and the other way round", async () => {
    const directory = mkdtempSync(join(tmpdir(), "imageforge-sparse-"));
    const input = blocks([["data", 2, 3], ["zero", 2], ["same", 0x5a, 3], ["data", 8, 1]]);
    const rawPath = join(directory, "in.img");
    const sparsePath = join(directory, "ref.sparse");
    writeFileSync(rawPath, input);
    execFileSync(IMG2SIMG, [rawPath, sparsePath, String(BLOCK)]);
    const reference = new Uint8Array(readFileSync(sparsePath));

    // their image through our reader, our image through their tool
    expect(await sha256Hex(await unpackSparse(bytesSource(reference), await parseSparse(bytesSource(reference))))).toBe(await sha256Hex(input));
    const oursPath = join(directory, "ours.sparse");
    writeFileSync(oursPath, await packSparse(bytesSource(input)));
    const backPath = join(directory, "back.img");
    execFileSync("simg2img", [oursPath, backPath]);
    expect(await sha256Hex(new Uint8Array(readFileSync(backPath)))).toBe(await sha256Hex(input));
  });

  it("refuses a block size that is not a multiple of four", async () => {
    await expect(packSparse(bytesSource(new Uint8Array(BLOCK)), { blockSize: 1001 })).rejects.toThrowError(/multiple of four/);
  });
});
const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOta = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);

describe.skipIf(!hasOta || !tools)("a real partition through the sparse writer", () => {
  it("writes a sparse image img2simg's reader turns back into the original bytes", async () => {
    const [{ listZip, parsePayload, payloadPartitionSource, storedEntrySource, readAll }, { fileSource }] =
      await Promise.all([import("@/core/package"), import("../fixtures/file-source")]);

    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    const payload = await parsePayload(payloadSource);
    const partition = payloadPartitionSource(payloadSource, payload, "splash");
    const raw = await readAll(partition);

    const sparse = await packSparse(partition);
    // a splash partition is a picture, so it is full of runs and mostly fills: much smaller
    expect(sparse.length).toBeLessThan(raw.length);
    const parsed = await parseSparse(bytesSource(sparse));
    expect(parsed.header.totalBlocks).toBe(Math.ceil(partition.size / parsed.header.blockSize));
    expect(await sha256Hex(await unpackSparse(bytesSource(sparse), parsed))).toBe(await sha256Hex(raw));

    // and the AOSP tool agrees end to end
    const directory = mkdtempSync(join(tmpdir(), "imageforge-sparse-real-"));
    const sparsePath = join(directory, "splash.sparse.img");
    const backPath = join(directory, "splash.raw.img");
    writeFileSync(sparsePath, sparse);
    execFileSync("simg2img", [sparsePath, backPath]);
    expect(await sha256Hex(new Uint8Array(readFileSync(backPath)))).toBe(await sha256Hex(raw));
    console.log("real splash partition:", raw.length, "bytes ->", sparse.length, "sparse bytes");
  }, 300000);
});
