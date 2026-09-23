import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
    // Only an environment read counts, so a comment that mentions a variable does not demand a row
    // and an ordinary constant that happens to start with IMAGEFORGE_ is not mistaken for material.
    const reads = [...tests.matchAll(/process\.env(?:\.|\[\s*")(IMAGEFORGE_[A-Z0-9_]+)/g)].map(
      (match) => match[1],
    );
    const variables = [...new Set(reads)].sort();
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

/**
 * The files a person meets before they meet the code. They are short, they are easy to let rot, and
 * an issue form that does not ask for the diagnostics export produces reports nobody can act on.
 */
describe("contributor-facing files", () => {
  const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

  it("keeps a code of conduct with a way to report", () => {
    const conduct = read("CODE_OF_CONDUCT.md");
    expect(conduct).toContain("Contributor Covenant");
    expect(conduct).toMatch(/Report a vulnerability|@[\w-]+/);
  });

  it("asks an issue form for what makes a report answerable", () => {
    const bug = read(".github/ISSUE_TEMPLATE/bug_report.yml");
    // The diagnostics export is the difference between a report and a guess.
    expect(bug).toContain("Export diagnostics");
    expect(bug).toContain("SECURITY.md");
    expect(read(".github/ISSUE_TEMPLATE/feature_request.yml")).toContain("reference");
    expect(read(".github/ISSUE_TEMPLATE/config.yml")).toContain("blank_issues_enabled");
  });

  it("keeps the pull request template honest about verification", () => {
    const template = read(".github/pull_request_template.md");
    expect(template).toContain("pnpm verify");
    expect(template).toContain("digest verified");
    expect(template).toMatch(/Not verified/);
  });
});

/**
 * A readme with a broken link or a screenshot that no longer exists is worse than a short one: it is
 * the first thing a visitor reads, and it is the file most likely to be edited in a hurry.
 */
describe("readme links", () => {
  const READMES = ["README.md", "README.zh-CN.md", "README.ja.md"];

  it("points at files that exist, in every language", () => {
    for (const name of READMES) {
      const readme = readFileSync(join(process.cwd(), name), "utf8");
      const relative = [...readme.matchAll(/\]\(([^)]+)\)/g)]
        .map((match) => match[1])
        .filter((target) => !target.startsWith("http") && !target.startsWith("#"));
      expect(relative.length, name).toBeGreaterThan(5);
      for (const target of relative) {
        expect(existsSync(join(process.cwd(), target.split("#")[0])), name + " -> " + target).toBe(true);
      }
    }
  });

  it("offers the same languages from every readme", () => {
    for (const name of READMES) {
      const readme = readFileSync(join(process.cwd(), name), "utf8");
      const others = READMES.filter((entry) => entry !== name);
      for (const other of others) {
        // The switcher links to the other files; the current language is plain text, not a link.
        const linked = readme.includes("(" + other + ")") || readme.includes('href="' + other + '"');
        expect(linked, name + " -> " + other).toBe(true);
      }
      expect(readme, name + " icon").toContain("docs/images/icon.svg");
    }
  });

  it("shows the interface rather than describing it", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    // Markdown images, and the src/srcset of a <picture> that swaps in the dark theme.
    const images = [
      ...[...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]),
      ...[...readme.matchAll(/srcset="([^"]+)"/g)].map((match) => match[1]),
      ...[...readme.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]),
    ];
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const image of images) {
      const file = join(process.cwd(), image);
      expect(existsSync(file), image).toBe(true);
      const bytes = readFileSync(file);
      if (image.endsWith(".svg")) {
        expect(bytes.subarray(0, 200).toString("utf8"), image).toContain("<svg");
        continue;
      }
      // A PNG signature, so a placeholder cannot pass as a screenshot.
      expect([...bytes.subarray(0, 4)], image).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(bytes.length).toBeGreaterThan(20_000);
    }
  });
});

/**
 * The icon in the readme is the mark the header draws, so it has to keep drawing the same thing: the
 * component owns the layout, and the standalone file is a copy that would otherwise drift silently.
 */
describe("the readme icon", () => {
  it("draws the same nine cells as the header mark", () => {
    const component = readFileSync(join(process.cwd(), "src/components/app/brand-mark.tsx"), "utf8");
    const cells = [...component.matchAll(/\{ column: (\d), row: (\d), accent: (true|false) \}/g)].map((match) => ({
      column: Number(match[1]),
      row: Number(match[2]),
      accent: match[3] === "true",
    }));
    expect(cells.length).toBe(9);

    const svg = readFileSync(join(process.cwd(), "docs/images/icon.svg"), "utf8");
    const rects = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="10" height="10" rx="2.2" fill="#([0-9a-f]{6})"\/>/g)].map(
      (match) => ({ x: Number(match[1]), y: Number(match[2]), fill: match[3] }),
    );
    expect(rects.length, "nine cells and the tile").toBe(9);

    const tile = svg.match(/<rect width="64" height="64" rx="12" fill="#([0-9a-f]{6})"\/>/);
    expect(tile, "the rounded tile").not.toBeNull();

    const accent = rects.find((rect) => rect.fill !== rects[0].fill)?.fill;
    expect(accent, "an accent colour is used").toBeDefined();
    for (const cell of cells) {
      const rect = rects.find((entry) => entry.x === 14 + cell.column * 13 && entry.y === 14 + cell.row * 13);
      expect(rect, cell.column + ":" + cell.row).toBeDefined();
      expect(rect?.fill === accent, cell.column + ":" + cell.row + " accent").toBe(cell.accent);
    }
  });
});
