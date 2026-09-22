import { describe, expect, it } from "vitest";
import {
  REFERENCE_XZ_DICTIONARY,
  XZ_ENCODER_DICTIONARY,
  declareDictionary,
  decodeXz,
  dictionaryProperty,
  encodeXz,
} from "@/core/image";

describe("the xz dictionary a stream declares", () => {
  it("encodes the dictionary sizes the reference streams use", () => {
    expect(dictionaryProperty(XZ_ENCODER_DICTIONARY)).toBe(0x16);
    expect(dictionaryProperty(REFERENCE_XZ_DICTIONARY)).toBe(0x1c);
    expect(() => dictionaryProperty(1500)).toThrowError(/property byte/);
  });

  it("rewrites only the property byte and the header checksum", async () => {
    const payload = new Uint8Array(64 * 1024).map((_, index) => (index * 7) & 0xff);
    const plain = await encodeXz(payload);
    const declared = await encodeXz(payload, { declareDictionarySize: REFERENCE_XZ_DICTIONARY });

    expect(declared.length).toBe(plain.length);
    const differing = [...plain.keys()].filter((index) => plain[index] !== declared[index]);
    expect(differing).toEqual([16, 20, 21, 22, 23]);
    expect(declared[16]).toBe(0x1c);

    // the payload still decodes, which is what matters: the window we searched fits in the one we name
    expect(Array.from(await decodeXz(declared))).toEqual(Array.from(payload));
  });

  it("refuses to name a dictionary smaller than the one it searched with", async () => {
    const stream = await encodeXz(new Uint8Array(4096));

    await expect(declareDictionary(stream, 1024)).rejects.toThrowError(/Refusing/);
  });

  it("refuses a stream it cannot describe", async () => {
    await expect(declareDictionary(new Uint8Array([1, 2, 3, 4]), REFERENCE_XZ_DICTIONARY)).rejects.toThrowError(
      /Not an xz stream/,
    );
  });
});
