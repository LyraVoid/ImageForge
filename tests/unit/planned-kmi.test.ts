import { describe, expect, it } from "vitest";
import { KERNELSU_KMI_SETTING, plannedKmi } from "@/core";

describe("the KMI a plan pins", () => {
  it("returns the chosen KMI", () => {
    expect(plannedKmi({ [KERNELSU_KMI_SETTING]: "android15-6.6" })).toBe("android15-6.6");
  });

  it("turns the plan sentinel into nothing chosen", () => {
    expect(plannedKmi({ [KERNELSU_KMI_SETTING]: "unset" })).toBe("");
    expect(plannedKmi({ [KERNELSU_KMI_SETTING]: "none" })).toBe("");
    expect(plannedKmi({ [KERNELSU_KMI_SETTING]: "  " })).toBe("");
    expect(plannedKmi({})).toBe("");
    expect(plannedKmi(undefined)).toBe("");
  });
});
