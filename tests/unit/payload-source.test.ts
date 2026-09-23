import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bytesSource,
  extractPackageEntry,
  extractPayloadPartition,
  listZip,
  parsePayload,
  payloadPartitionSource,
  payloadPartitionStream,
  storedEntrySource,
} from "@/core/package";
import { parseErofs, readDirectory, readInodeData, resolveErofsPath } from "@/core/partition";
import { detectArtifact } from "@/core/workspace";
import { sha256Hex } from "@/core/hash";
import { fileSource } from "../fixtures/file-source";
import { repoPath } from "../fixtures/artifacts";

const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOtaPackage = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);
const DIGESTS = process.env.IMAGEFORGE_PAYLOAD_DIGESTS ?? repoPath(".research", "aster-validation", "erofs-payload-digests.txt");

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function openPayload(zipPath: string) {
  const zipSource = fileSource(zipPath);
  const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
  if (!entry) throw new Error("no payload.bin in " + zipPath);
  const payloadSource = storedEntrySource(zipSource, entry);
  return { zipSource, payloadSource, payload: await parsePayload(payloadSource) };
}

describe.skipIf(!hasOtaPackage)("a payload partition as a range source", () => {
  it("browses product in ranges and agrees with the extracted buffer byte for byte", async () => {
    const { zipSource, payloadSource, payload } = await openPayload(OTA_PACKAGE);
    const ranged = payloadPartitionSource(payloadSource, payload, "product");

    expect(detectArtifact(await ranged.read(0, 8192)).kind).toBe("filesystem");
    const rangedSuperblock = await parseErofs(ranged);
    const rangedRoot = await resolveErofsPath(ranged, rangedSuperblock, "/");
    const rangedNames = (await readDirectory(ranged, rangedSuperblock, rangedRoot)).map((entry) => entry.name);

    // the same image, materialized: the two paths have to agree
    const extracted = bytesSource(await extractPackageEntry(zipSource, "payload.bin::product"));
    const plainSuperblock = await parseErofs(extracted);
    const plainRoot = await resolveErofsPath(extracted, plainSuperblock, "/");
    expect(rangedNames).toEqual((await readDirectory(extracted, plainSuperblock, plainRoot)).map((entry) => entry.name));

    const path = "/etc/build_flags.json";
    const rangedBytes = await readInodeData(ranged, rangedSuperblock, await resolveErofsPath(ranged, rangedSuperblock, path));
    const plainBytes = await readInodeData(extracted, plainSuperblock, await resolveErofsPath(extracted, plainSuperblock, path));
    expect(await sha256Hex(rangedBytes)).toBe(await sha256Hex(plainBytes));

    // and browsing must not have decoded the whole partition
    expect(ranged.stats.decodedBytes).toBeLessThan(ranged.size);
  }, 600000);

  it("reads a file out of a 759 MB partition without materializing it", async () => {
    if (!existsSync(DIGESTS)) return;
    const lines = readFileSync(DIGESTS, "utf8").trim().split("\n").filter((line) => line.trim() !== "");
    const { payloadSource, payload } = await openPayload(OTA_PACKAGE);
    const ranged = payloadPartitionSource(payloadSource, payload, "system");

    for (const line of lines) {
      const [digest, file] = line.trim().split(/\s+/);
      // The device path is used as it is: it goes through the partition's own symlinks
      // (/etc -> /system/etc), which the resolver follows, exactly as a user clicking through would.
      const inode = await resolveErofsPath(ranged, await parseErofs(ranged), file);
      const data = await readInodeData(ranged, await parseErofs(ranged), inode);
      expect(await sha256Hex(data), file).toBe(digest);
    }
    expect(ranged.stats.decodedBytes).toBeLessThan(64 * 1024 * 1024);
  }, 900000);

  it("streams a real partition to exactly the bytes the materializing reader produces", async () => {
    const { payloadSource, payload } = await openPayload(OTA_PACKAGE);
    const partition = payload.partitions.find((entry) => entry.name === "splash");
    expect(partition).toBeDefined();

    const streamed = await collect(payloadPartitionStream(payloadSource, payload, "splash"));
    const inMemory = await extractPayloadPartition(payloadSource, payload, "splash");

    expect(streamed.length).toBe(inMemory.length);
    expect(await sha256Hex(streamed)).toBe(await sha256Hex(inMemory));
  }, 900000);

  it("refuses a partition that is stored as a delta", async () => {
    const { payload } = await openPayload(OTA_PACKAGE);
    const delta = payload.partitions.find((partition) => partition.requiresSource);
    if (!delta) return; // this payload has none
    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    expect(() => payloadPartitionSource(payloadSource, payload, delta.name)).toThrowError(/delta/);
  }, 600000);
});
