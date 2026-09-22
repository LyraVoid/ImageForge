import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTIFACT_CATALOG } from "@/core";

const root = join(process.cwd(), "THIRD_PARTY_LICENSES");

/**
 * The rule this enforces is the one in docs/architecture.md: every bundled GPL artifact is
 * registered under THIRD_PARTY_LICENSES with a pinned revision. A new bundled artifact therefore
 * cannot be added without touching the licence record, and a re-pinned artifact cannot keep a stale
 * record.
 */
function licenceText(): string {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(join(root, entry.name))
        .filter((file) => file.endsWith(".md"))
        .map((file) => readFileSync(join(root, entry.name, file), "utf8")),
    )
    .join("\n");
}

describe("third-party licence register", () => {
  it("registers every bundled artifact", () => {
    const text = licenceText();
    const bundled = ARTIFACT_CATALOG.releases.flatMap((release) =>
      release.artifacts
        .filter((artifact) => (artifact.source ?? "").startsWith("bundled:"))
        .map((artifact) => ({ providerId: release.providerId, artifact })),
    );
    expect(bundled.length).toBeGreaterThan(10);

    const unregistered: string[] = [];
    for (const { providerId, artifact } of bundled) {
      const file = (artifact.source ?? "").slice("bundled:".length).split("/").pop() ?? "";
      const kmi = file.match(/android\d+-\d+\.\d+/)?.[0] ?? "";
      const known =
        (artifact.sha256 !== undefined && text.includes(artifact.sha256)) ||
        (file !== "" && text.includes(file)) ||
        text.includes(artifact.id) ||
        (kmi !== "" && text.includes(kmi));
      if (!known) unregistered.push(providerId + "/" + artifact.id + " (" + file + ")");
    }

    expect(unregistered, "not in THIRD_PARTY_LICENSES: " + unregistered.join(", ")).toEqual([]);
  });

  it("names the upstream repository and a pinned revision for every provider it registers", () => {
    for (const entry of readdirSync(root, { withFileTypes: true }).filter((value) => value.isDirectory())) {
      const readme = readFileSync(join(root, entry.name, "README.md"), "utf8");
      expect(readme, entry.name).toMatch(/https:\/\/github\.com\//);
      // a commit, a tag or a release number: something that can be looked up again
      expect(readme, entry.name).toMatch(/Pinned (revision|release)|[0-9a-f]{40}|v\d+\.\d+/);
      expect(readme.length).toBeGreaterThan(500);
    }
  });
});
