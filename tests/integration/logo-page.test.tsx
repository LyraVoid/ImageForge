// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LogoPage } from "@/routes/LogoPage";
import { useForgeStore } from "@/stores/forge-store";
import { toFile } from "../fixtures/bootimg";
import { buildSplash } from "../fixtures/splash";

const store = () => useForgeStore.getState();

function renderLogo() {
  return render(
    <MemoryRouter initialEntries={["/tools/logo"]}>
      <Routes>
        <Route path="/tools/logo" element={<LogoPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await store().reset();
});

afterEach(cleanup);

describe("the splash editor page", () => {
  it("asks for a splash image when nothing is open", () => {
    renderLogo();

    expect(screen.getByText(/Drop a splash\.img/)).toBeInTheDocument();
  });

  it("lists the frames and packs the image again unchanged", async () => {
    const image = await buildSplash([
      { name: "boot", width: 8, height: 4, color: [200, 0, 0] },
      { name: "at", width: 4, height: 2, color: [0, 0, 200] },
    ]);
    await store().analyzeFile(toFile(image, "splash.img"));

    renderLogo();

    expect(await screen.findByText(/2 frames/)).toBeInTheDocument();
    expect(screen.getByText("boot")).toBeInTheDocument();
    expect(screen.getByText("at")).toBeInTheDocument();
    expect(screen.getByText(/8×4/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pack and download/ }));

    expect(await screen.findByText(/The result is the same size/)).toBeInTheDocument();
    expect(store().artifacts).toHaveLength(1);
    expect(store().artifacts[0].sizeBytes).toBe(image.length);
    expect(store().artifacts[0].name).toBe("splash-patched.img");
    // the frames can also leave as one archive, which needs no canvas and so works here too
    expect(screen.getByRole("button", { name: /Export all frames/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Batch replace/ })).toBeInTheDocument();
  }, 60000);

  it("offers the adaptation modes and a size field only for the custom one", async () => {
    const image = await buildSplash([{ name: "boot", width: 4, height: 4, color: [1, 2, 3] }]);
    await store().analyzeFile(toFile(image, "splash.img"));

    renderLogo();
    await screen.findByText(/1 frames/);

    // the width and height fields only exist in custom mode
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Custom size" }));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    expect(store().splashMode).toBe("custom");

    // and they feed the store, which is what the adaptation reads
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "128" } });
    expect(store().splashCustomWidth).toBe(128);
  }, 60000);
});
