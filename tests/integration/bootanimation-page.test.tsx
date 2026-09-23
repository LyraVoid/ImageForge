// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packAnimation } from "@/core/animation";
import { BootAnimationPage } from "@/routes/BootAnimationPage";
import { useForgeStore } from "@/stores/forge-store";
import { toFile } from "../fixtures/bootimg";

const store = () => useForgeStore.getState();

function renderAnimation() {
  return render(
    <MemoryRouter initialEntries={["/tools/bootanimation"]}>
      <Routes>
        <Route path="/tools/bootanimation" element={<BootAnimationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await store().reset();
});

afterEach(cleanup);

describe("the boot animation tool", () => {
  it("asks for an archive when nothing is open", () => {
    renderAnimation();

    expect(screen.getByText(/Drop a bootanimation.zip/)).toBeInTheDocument();
  });

  it("lists the parts, edits the desc and packs it again", async () => {
    const frame = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const archive = await packAnimation([
      { name: "desc.txt", data: new TextEncoder().encode("8 4 24\np 1 0 part0\n") },
      { name: "part0/", data: new Uint8Array(0) },
      { name: "part0/a.png", data: frame },
    ]);
    await store().analyzeFile(toFile(archive, "bootanimation.zip"));

    renderAnimation();

    // the summary is composed of several text nodes in one element, so match the whole element text
    expect(await screen.findByText(/1 parts, 1 frames/)).toBeInTheDocument();
    expect(screen.getAllByText("part0").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Width")).toHaveValue(8);

    // the animation's own fields are editable, and that is what marks the desc for rewriting
    fireEvent.change(screen.getByLabelText("fps"), { target: { value: "30" } });
    expect(store().animationDescDraft).toContain("8 4 30");
    expect(store().animation?.fps).toBe(30);

    fireEvent.click(screen.getByRole("button", { name: /Pack and download/ }));

    expect((await screen.findAllByText("bootanimation.zip")).length).toBeGreaterThan(0);
    const artifact = store().artifacts.find((entry) => entry.name === "bootanimation.zip");
    expect(artifact?.params?.animation).toBe("true");
    expect(artifact?.params?.descRewritten).toBe("true");
    expect(artifact?.params?.verified).toBe("entries-intact");
  }, 60000);
});
