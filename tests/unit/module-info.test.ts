import { describe, expect, it } from "vitest";
import { machineName, readModuleInfo } from "@/core/image";
import { buildElfObject, buildModuleObject } from "../fixtures/elf";

describe("loadable kernel module metadata", () => {
  it("reads what a module declares", () => {
    const info = readModuleInfo(
      buildModuleObject({
        name: "kernelsu",
        vermagic: "6.6.127-4k-g46a034eca005-dirty SMP preempt mod_unload modversions aarch64",
        license: "GPL",
        author: "weishu",
        description: "Android KernelSU",
      }),
    );

    expect(info.name).toBe("kernelsu");
    expect(info.vermagic).toContain("6.6.127");
    expect(info.license).toBe("GPL");
    expect(info.author).toBe("weishu");
    expect(info.description).toBe("Android KernelSU");
    expect(info.parameters).toEqual(["allow_shell:bool", "norc:bool"]);
  });

  it("rejects anything that is not a relocatable module", () => {
    expect(() => readModuleInfo(new Uint8Array(80))).toThrowError(/not an ELF/);
    expect(() => readModuleInfo(new Uint8Array(16))).toThrowError(/too small/);

    const executable = buildElfObject({
      sectionName: ".modinfo",
      payload: new TextEncoder().encode("name=x\0"),
      type: 2,
    });
    expect(() => readModuleInfo(executable)).toThrowError(/not relocatable/);

    const withoutModinfo = buildElfObject({
      sectionName: ".other",
      payload: new TextEncoder().encode("name=x\0"),
    });
    expect(() => readModuleInfo(withoutModinfo)).toThrowError(/modinfo/);
  });

  it("names the machine it was built for", () => {
    expect(machineName(183)).toBe("arm64");
    expect(machineName(62)).toBe("x86_64");
    expect(machineName(3)).toBe("machine 3");
  });
});
