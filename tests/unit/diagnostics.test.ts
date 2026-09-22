import { describe, expect, it } from "vitest";
import { buildDiagnostics, diagnosticsFileName, diagnosticsJson } from "@/lib/diagnostics";
import { fakeAnalysis, fakeOutput, fakePlan } from "../fixtures/forge";

function input(overrides: Partial<Parameters<typeof buildDiagnostics>[0]> = {}) {
  return {
    file: { name: "boot.img", size: 67_108_864 },
    locale: "en",
    analysis: fakeAnalysis(),
    plan: fakePlan(),
    output: fakeOutput(),
    error: null,
    generatedAt: "2026-01-01T00:00:00.000Z",
    userAgent: "vitest",
    ...overrides,
  };
}

/** Every key of a nested JSON value, so a leaked field cannot hide inside an object. */
function allKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) allKeys(entry, found);
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      found.push(key);
      allKeys(entry, found);
    }
  }
  return found;
}

describe("diagnostics report", () => {
  it("records the facts of a run", () => {
    const report = buildDiagnostics(input());

    expect(report.tool).toEqual({
      name: "ImageForge",
      version: "0.1",
      locale: "en",
      userAgent: "vitest",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(report.image).toEqual({ name: "boot.img", sizeBytes: 67_108_864 });
    expect(report.plan?.id).toBe("1".repeat(32));
    expect(report.result?.metadata.kernelSizeAfter).toBe("2345");
    expect(report.result?.verification.verification.valid).toBe(true);
    expect(report.analysis?.sha256).toBe("c".repeat(64));
    expect(report.error).toBeNull();
  });

  it("works with nothing but a failure to report", () => {
    const report = buildDiagnostics(
      input({
        analysis: null,
        plan: null,
        output: null,
        error: { code: "IMAGE_PARSE_ERROR", message: "This image could not be parsed.", technical: "magic" },
      }),
    );

    expect(report.analysis).toBeNull();
    expect(report.plan).toBeNull();
    expect(report.result).toBeNull();
    expect(report.error?.code).toBe("IMAGE_PARSE_ERROR");
    expect(report.image?.name).toBe("boot.img");
  });

  it("carries no image bytes and no run options", () => {
    const keys = allKeys(buildDiagnostics(input()));
    for (const forbidden of ["bytes", "blob", "attachments", "options", "providerOptions", "superkey"]) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
  });

  it("never contains a superkey, even when one was used for the run", () => {
    const key = "s3cret-superkey-value";
    // The key lives in the run options, which the report is built without on purpose.
    const report = buildDiagnostics(
      input({
        plan: fakePlan({ configuration: { ...fakePlan().configuration, superkeyMode: "custom" } }),
        output: fakeOutput({ metadata: { ...fakeOutput().metadata, superkeyMode: "custom" } }),
      }),
    );

    expect(diagnosticsJson(report)).not.toContain(key);
    expect(allKeys(report)).not.toContain("superkey");
    expect(report.plan?.configuration.superkeyMode).toBe("custom");
  });

  it("names the file after the image it describes", () => {
    const report = buildDiagnostics(input());
    const name = diagnosticsFileName(report, "2026-01-02T03:04:05.678Z");

    expect(name).toBe("diagnostics_boot_2026-01-02T03-04-05-678Z.json");
    expect(diagnosticsJson(report)).toContain('"plan"');
  });
});
