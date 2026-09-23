import { describe, expect, it } from "vitest";
import { APP_VERSION, SOURCE_URL } from "@/lib/app-meta";

/**
 * Two constants the interface shows: the version, which has to be the one the package records, and
 * the source link, which must point at a repository or at nothing. A placeholder host shipped once
 * and produced a link that went nowhere.
 */
describe("application metadata", () => {
  it("uses the version the package records", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    expect(APP_VERSION).toBe(version);
  });

  it("links to a repository or to nothing at all", () => {
    expect(SOURCE_URL === "" || /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(SOURCE_URL)).toBe(true);
  });
});
