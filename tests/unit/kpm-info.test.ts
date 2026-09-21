import { describe, expect, it } from "vitest";
import { describeKpm, readKpmInfo } from "@/core";
import { buildKpm } from "../fixtures/kpm";

describe("KernelPatch module metadata", () => {
  it("reads every declared field from a valid module", () => {
    const info = readKpmInfo(
      buildKpm({
        name: "demo",
        version: "9.9.9",
        license: "GPL-2.0",
        author: "someone",
        description: "a test module",
      }),
    );

    expect(info).toEqual({
      name: "demo",
      version: "9.9.9",
      license: "GPL-2.0",
      author: "someone",
      description: "a test module",
    });
    expect(describeKpm(info)).toBe("demo 9.9.9 [GPL-2.0] by someone");
  });

  it("rejects anything that is not a relocatable aarch64 ELF", () => {
    expect(() => readKpmInfo(new Uint8Array(256))).toThrowError(/not an ELF/);
    expect(() => readKpmInfo(new Uint8Array(32))).toThrowError(/too small/);

    const wrongMachine = buildKpm();
    new DataView(wrongMachine.buffer).setUint16(18, 62, true);
    expect(() => readKpmInfo(wrongMachine)).toThrowError(/aarch64/);

    const wrongType = buildKpm();
    new DataView(wrongType.buffer).setUint16(16, 2, true);
    expect(() => readKpmInfo(wrongType)).toThrowError(/relocatable/);
  });

  it("rejects a module without an allocated .kpm.info section", () => {
    const module = buildKpm();
    const marker = new TextEncoder().encode(".kpm.info");
    const index = module.findIndex((_, position) =>
      marker.every((byte: number, offset: number) => module[position + offset] === byte),
    );
    expect(index).toBeGreaterThan(0);
    module[index] = "x".charCodeAt(0);
    expect(() => readKpmInfo(module)).toThrowError(/kpm\.info/);
  });

  it("rejects a truncated module", () => {
    const module = buildKpm();
    const truncated = module.subarray(0, module.length - 8);
    expect(() => readKpmInfo(truncated)).toThrowError(/fit in the file|past the end/);
  });
});
