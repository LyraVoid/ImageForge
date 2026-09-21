import { describe, expect, it } from "vitest";
import { mergePlanOptions } from "@/stores/plan-options";

describe("plan option merging", () => {
  const plan = {
    kpmModules: "Nohello-v1.8.3.7-102-ab38e9c-release.kpm",
    kernelPatchFlavor: "aster",
    preserveImageSize: "false",
    requiredManager: "me.yuki.aster",
  };

  it("keeps options another control already set", () => {
    const next = mergePlanOptions(plan, {}, { kernelPatchFlavor: "upstream" });

    expect(next.kernelPatchFlavor).toBe("upstream");
    expect(next.kpmModules).toBe("Nohello-v1.8.3.7-102-ab38e9c-release.kpm");
    expect(next.preserveImageSize).toBe("false");
  });

  it("lets the draft and the newest change win", () => {
    const next = mergePlanOptions(plan, { preserveImageSize: "true" }, { preserveImageSize: "false" });

    expect(next.preserveImageSize).toBe("false");
    expect(next.kpmModules).toBe("Nohello-v1.8.3.7-102-ab38e9c-release.kpm");
  });

  it("keeps the module list when only the size changes", () => {
    const next = mergePlanOptions(plan, {}, { preserveImageSize: "true" });

    expect(next.kpmModules).toBe("Nohello-v1.8.3.7-102-ab38e9c-release.kpm");
    expect(next.preserveImageSize).toBe("true");
    expect(next.kernelPatchFlavor).toBe("aster");
  });

  it("copes with a plan that has no options yet", () => {
    expect(mergePlanOptions(undefined, {}, { kpmModules: "a.kpm" })).toEqual({ kpmModules: "a.kpm" });
  });
});
