import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readTree(directory: string): string {
  const parts: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(readTree(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) parts.push(readFileSync(path, "utf8"));
  }
  return parts.join("\n");
}

describe("documentation coverage", () => {
  /**
   * The repository's rule is that a test needing material skips itself and names the environment
   * variable that supplies it. This is what keeps that promise honest: every variable the suite reads
   * has to be in the page that lists them.
   */
  it("documents every environment variable the tests read for material", () => {
    const tests = readTree(join(process.cwd(), "tests"));
    const variables = [...new Set(tests.match(/IMAGEFORGE_[A-Z0-9_]+/g) ?? [])].sort();
    expect(variables.length).toBeGreaterThan(10);

    const page = readFileSync(join(process.cwd(), "docs", "testing.md"), "utf8");
    const missing = variables.filter((name) => !page.includes(name));
    expect(missing, "docs/testing.md is missing: " + missing.join(" | ")).toEqual([]);
  });

  it("keeps the gate command in the testing page and the readme in step", () => {
    const page = readFileSync(join(process.cwd(), "docs", "testing.md"), "utf8");
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    for (const stage of ["typecheck", "lint", "test", "build"]) {
      expect(page, stage).toContain(stage);
    }
    expect(readme).toContain("docs/testing.md");
  });
});
