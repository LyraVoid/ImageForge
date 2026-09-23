// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { SettingsPage } from "@/routes/SettingsPage";

/** The version the interface shows has to be the one the package records, not a second copy. */
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  version: string;
};

describe("settings page", () => {
  it("shows the version the package records", () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const line = screen.getByText(new RegExp("Version " + version.replace(/\./g, "\\.")));
    expect(line.textContent).toContain("AGPL-3.0-or-later");
  });
});
