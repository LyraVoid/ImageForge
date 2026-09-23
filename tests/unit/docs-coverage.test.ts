import { execFileSync } from "node:child_process";
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

  /**
   * The material table is generated from the tests rather than kept by hand, and the generator fails
   * in both directions: a variable the tests read but the table does not declare, and a declared
   * variable nothing reads any more. Running it here means CI checks the table cannot drift.
   */
  it("keeps the material table generated rather than handwritten", () => {
    const output = execFileSync("node", ["scripts/materials.mjs", "--check"], { encoding: "utf8" });
    expect(output).toContain("up to date");
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
