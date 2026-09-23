// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiffPage } from "@/routes/DiffPage";
import { useForgeStore } from "@/stores/forge-store";
import { buildBootImage, toFile } from "../fixtures/bootimg";
import { buildZip } from "../fixtures/zip";

const store = () => useForgeStore.getState();

function renderDiff() {
  return render(
    <MemoryRouter initialEntries={["/tools/diff"]}>
      <Routes>
        <Route path="/tools/diff" element={<DiffPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await store().reset();
});

afterEach(cleanup);

describe("the compare tool", () => {
  it("asks for an image when nothing is open", () => {
    renderDiff();

    expect(screen.getByText(/Open the image you want to compare/)).toBeInTheDocument();
    expect(screen.getByText("boot image / package / partition / any other file")).toBeInTheDocument();
  });

  it("compares an artifact with the open image and reports the verdict", async () => {
    const boot = await buildBootImage({});
    const zip = await buildZip([{ name: "init_boot.img", data: boot }]);
    await store().analyzeFile(toFile(zip, "images.zip"));

    // the artifact comes out of the package, the way the extract tool produces one
    const artifact = await store().extractEntry("init_boot.img");
    expect(artifact).not.toBeNull();

    renderDiff();

    // the zip is the source, so the comparison is a byte one without section names
    fireEvent.click(await screen.findByRole("button", { name: /Compare/ }));
    expect(await screen.findByText(/differ, in \d+ range/)).toBeInTheDocument();
    expect(screen.getByText(/not a boot image/)).toBeInTheDocument();

    // now open the extracted boot image itself and compare the very same bytes: identical
    await store().openArtifactAsSource(artifact?.id as string);
    await store().compareWithArtifact(artifact?.id as string);
    expect(store().diff?.identical).toBe(true);
    expect((await screen.findAllByText(/Identical/)).length).toBeGreaterThan(0);
    // and this time the sections are named, because the source is a boot image
    expect(store().diff?.sections?.some((section) => section.name === "ramdisk")).toBe(true);
  }, 60000);
});
