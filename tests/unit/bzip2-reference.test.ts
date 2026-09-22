import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listZip, parsePayload, payloadPartitionSource, storedEntrySource } from "@/core/package";
import { decodeBzip2 } from "@/core/image/bzip2";
import { sha256Hex } from "@/core/hash";
import { fileSource } from "../fixtures/file-source";

const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOtaPackage = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);

/**
 * The reference `bunzip2 -c` output for the REPLACE_BZ operation the Rust decoder rejected, from the
 * splash partition of the CPH2723 full OTA: 2,097,152 bytes.
 */
const REFERENCE_DIGEST = "906337b1430979fed0bbfe4aee0801492c9a2fb74adb0875d87d87380e0874b5";

describe.skipIf(!hasOtaPackage)("the real bzip2 payload operation", () => {
  it("decodes with the reference implementation to exactly what bunzip2 writes", async () => {
    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    const payload = await parsePayload(payloadSource);
    const partition = payload.partitions.find((candidate) => candidate.name === "splash");
    const operation = partition?.operations.find((candidate) => candidate.type === 1);
    expect(operation, "the splash partition has a REPLACE_BZ operation").toBeDefined();

    const blob = await payloadSource.read(
      payload.dataOffset + (operation?.dataOffset ?? 0),
      operation?.dataLength ?? 0,
    );
    const capacity = (operation?.dstExtents ?? []).reduce(
      (sum, extent) => sum + extent.numBlocks * payload.blockSize,
      0,
    );

    const decoded = await decodeBzip2(blob, capacity);
    expect(decoded.length).toBe(capacity);
    expect(await sha256Hex(decoded)).toBe(REFERENCE_DIGEST);
  }, 600000);

  it("still reads the partition it belongs to, in ranges", async () => {
    const zipSource = fileSource(OTA_PACKAGE);
    const entry = (await listZip(zipSource)).find((candidate) => candidate.name === "payload.bin");
    const payloadSource = storedEntrySource(zipSource, entry as never);
    const payload = await parsePayload(payloadSource);
    const ranged = payloadPartitionSource(payloadSource, payload, "splash");
    const bytes = await ranged.read(0, 4096);
    writeFileSync("/tmp/splash-head.bin", bytes);
    expect(bytes.length).toBe(4096);
  }, 600000);
});
