import { describe, expect, it } from "vitest";
import { KEEP_SIGNATURE_SETTING, PRESERVE_IMAGE_SIZE_SETTING, outputOptions } from "@/core";

describe("output options", () => {
  it("keeps the original signature by default, like the official patchers do", () => {
    expect(outputOptions(undefined, undefined)).toEqual({ preserveImageSize: false, keepSignature: true });
    expect(outputOptions({}, {})).toEqual({ preserveImageSize: false, keepSignature: true });
  });

  it("reads both options from the plan", () => {
    const plan = { [PRESERVE_IMAGE_SIZE_SETTING]: "true", [KEEP_SIGNATURE_SETTING]: "false" };
    expect(outputOptions(plan, undefined)).toEqual({ preserveImageSize: true, keepSignature: false });
  });

  it("lets the run override the plan", () => {
    const plan = { [PRESERVE_IMAGE_SIZE_SETTING]: "true", [KEEP_SIGNATURE_SETTING]: "true" };
    const run = { [KEEP_SIGNATURE_SETTING]: "false" };
    expect(outputOptions(plan, run)).toEqual({ preserveImageSize: true, keepSignature: false });
  });
});
