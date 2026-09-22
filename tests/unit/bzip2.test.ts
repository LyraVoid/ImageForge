import { describe, expect, it } from "vitest";
import { decodeBzip2 } from "@/core";
import { bzip2Compress, hasBzip2 } from "../fixtures/bzip2";

const encoder = new TextEncoder();

describe.skipIf(!hasBzip2())("bzip2 decoding", () => {
  it("expands what the reference tool compressed", async () => {
    const data = encoder.encode("ImageForge bzip2 round trip ".repeat(200));
    const compressed = bzip2Compress(data);

    expect(compressed[0]).toBe(0x42); // "B"
    const expanded = await decodeBzip2(compressed, data.length);
    expect(expanded.length).toBe(data.length);
    expect([...expanded.subarray(0, 16)]).toEqual([...data.subarray(0, 16)]);
  });

  it("grows past a capacity hint that is too small", async () => {
    const data = new Uint8Array(256 * 1024);
    for (let index = 0; index < data.length; index += 1) data[index] = index % 251;
    const compressed = bzip2Compress(data);

    const expanded = await decodeBzip2(compressed, 1024);
    expect(expanded.length).toBe(data.length);
    expect(expanded[data.length - 1]).toBe(data[data.length - 1]);
  });

  it("refuses a stream that is not bzip2, instead of returning nonsense", async () => {
    await expect(decodeBzip2(new Uint8Array(64).fill(0x11), 1024)).rejects.toThrowError();
  });
});
