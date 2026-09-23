import { describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import {
  extractPayloadPartition,
  logicalPartitionStream,
  parsePayload,
  payloadPartitionStream,
  payloadPartitionSource,
} from "@/core/package";
import { parseSuper, logicalPartitionSource } from "@/core/partition";
import { sha256Hex } from "@/core/hash";
import { buildPayload } from "../fixtures/payload";
import { buildSuper } from "../fixtures/super";
import { buildBootImage } from "../fixtures/bootimg";

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe("streaming a payload partition", () => {
  it("produces exactly what the materializing reader produces", async () => {
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([
      { name: "init_boot", data: image, compress: "xz" },
      { name: "system", data: new Uint8Array(300_000).map((_, index) => (index * 7) % 251), compress: "bz2" },
    ]);

    for (const name of ["init_boot", "system"]) {
      const source = bytesSource(payload);
      const inMemory = await extractPayloadPartition(source, await parsePayload(source), name);
      const streamed = await collect(payloadPartitionStream(source, await parsePayload(source), name));
      expect(streamed.length, name).toBe(inMemory.length);
      expect(await sha256Hex(streamed), name).toBe(await sha256Hex(inMemory));
    }
  });

  it("reads a partition in ranges and as a stream to the same bytes", async () => {
    const payload = await buildPayload([
      { name: "system", data: new Uint8Array(200_000).map((_, index) => (index * 13) % 253), compress: "xz" },
    ]);
    const source = bytesSource(payload);
    const parsed = await parsePayload(source);

    const ranged = payloadPartitionSource(source, parsed, "system");
    const fromRanges = new Uint8Array(ranged.size);
    for (let offset = 0; offset < ranged.size; offset += 4096) {
      const chunk = await ranged.read(offset, Math.min(4096, ranged.size - offset));
      fromRanges.set(chunk, offset);
    }
    const streamed = await collect(payloadPartitionStream(source, parsed, "system"));
    expect(await sha256Hex(fromRanges)).toBe(await sha256Hex(streamed));
  });
});

describe("streaming a logical partition", () => {
  it("produces exactly what the extents reader produces", async () => {
    // extents are sector granular, so the fixture's data is too: 150016 bytes each, 300032 in total
    const system = new Uint8Array(300_032).map((_, index) => (index * 17) % 251);
    const { bytes } = await buildSuper([
      { name: "system", extents: [{ data: system.subarray(0, 150_016) }, { data: system.subarray(150_016) }] },
      { name: "userdata", extents: [{ data: null }] },
    ]);
    const source = bytesSource(bytes);
    const parsed = await parseSuper(source);

    const streamed = await collect(logicalPartitionStream(source, parsed, "system", 64 * 1024));
    const expected = await collect(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          controller.enqueue(await logicalPartitionSource(source, parsed, "system").read(0, system.length));
          controller.close();
        },
      }),
    );
    expect(streamed.length).toBe(system.length);
    expect(await sha256Hex(streamed)).toBe(await sha256Hex(expected));
    expect(await sha256Hex(streamed)).toBe(await sha256Hex(system));

    // a dm-zero extent streams zeroes rather than reading the image
    const hole = await collect(logicalPartitionStream(source, parsed, "userdata", 128));
    expect(hole.length).toBe(512);
    expect([...hole].every((byte) => byte === 0)).toBe(true);
  });
});
