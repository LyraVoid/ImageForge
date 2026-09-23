// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsPage } from "@/routes/SettingsPage";

/** The version the interface shows has to be the one the package records, not a second copy. */
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  version: string;
};

afterEach(cleanup);

describe("settings page", () => {
  it("shows the version the package records", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const line = await screen.findByText(new RegExp("Version " + version.replace(/\./g, "\\.")));
    expect(line.textContent).toContain("AGPL-3.0-or-later");

    // The page probes the WebAssembly module in an effect. Waiting for the result keeps that work
    // from landing after the test, which is what an unhandled react-dom error looked like.
    expect(await screen.findByText(/loaded 1\.0\.0/)).toBeInTheDocument();
  });
});
