// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "@/app/Header";
import { TOOLS } from "@/app/tools";
import { ToolsPage } from "@/routes/ToolsPage";
import { createTranslator } from "@/i18n/translate";
import { en } from "@/i18n/messages/en";

const t = createTranslator(en);

function renderAt(path: string, node: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
}

afterEach(cleanup);

describe("the tools page", () => {
  it("offers every registered tool and marks the ones that are not there yet", () => {
    renderAt("/", <ToolsPage />);

    for (const tool of TOOLS) {
      expect(screen.getByText(t(tool.titleKey))).toBeInTheDocument();
    }
    // the patcher is the primary card and starts with the dropzone right on the page
    expect(screen.getByText("Drop an Android image here")).toBeInTheDocument();
    const planned = TOOLS.filter((tool) => tool.status === "planned").length;
    expect(screen.queryAllByText("Planned")).toHaveLength(planned);
    // every tool except the primary card is a button with its own status badge
    expect(screen.getAllByRole("button", { name: /Available|Planned/ })).toHaveLength(TOOLS.length - 1);
  });

  it("disables a tool that has no implementation", () => {
    renderAt("/", <ToolsPage />);

    for (const button of screen.getAllByRole("button")) {
      if (button.textContent?.includes("Planned")) expect(button).toBeDisabled();
    }
  });

  it("keeps the workflow steps out of the tools page", () => {
    renderAt("/", <Header />);
    expect(screen.queryByRole("list", { name: /workflow progress/i })).toBeNull();
  });

  it("shows the workflow steps inside the patcher", () => {
    renderAt("/tools/patch/plan", <Header />);
    expect(screen.getByRole("list", { name: /workflow progress/i })).toBeInTheDocument();
  });
});
