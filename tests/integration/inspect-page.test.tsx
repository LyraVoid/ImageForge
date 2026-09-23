// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectPage } from "@/routes/InspectPage";
import { useForgeStore } from "@/stores/forge-store";
import { buildBootImage, toFile } from "../fixtures/bootimg";
import { buildSparse } from "../fixtures/sparse";
import { buildZip } from "../fixtures/zip";

const store = () => useForgeStore.getState();

function renderInspect() {
  return render(
    <MemoryRouter initialEntries={["/tools/inspect"]}>
      <Routes>
        <Route path="/tools/inspect" element={<InspectPage />} />
        <Route path="/tools/unpack" element={<p>unpack page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await store().reset();
});

afterEach(cleanup);

describe("the inspect tool", () => {
  it("asks for a file when nothing is open", () => {
    renderInspect();

    expect(screen.getByText(/Drop any image, package or partition/)).toBeInTheDocument();
    expect(screen.getByText("boot / package / sparse / super / filesystem / logo")).toBeInTheDocument();
  });

  it("reports what a boot image is, without offering to patch it", async () => {
    await store().analyzeFile(toFile(await buildBootImage({}), "boot.img"));
    expect(store().analysis).not.toBeNull();

    renderInspect();

    expect(screen.getByText("Digests")).toBeInTheDocument();
    expect(screen.getByText(/sha256/)).toBeInTheDocument();
    expect(screen.getByText("Patch methods")).toBeInTheDocument();
    // a read-only tool: the analysis is shown, but there is no way to start a patch from here
    expect(screen.queryByRole("button", { name: /Select/ })).toBeNull();
    expect(screen.getByText(/This tool only looks/)).toBeInTheDocument();
  });

  it("keeps a dropped boot image in the read-only report", async () => {
    renderInspect();
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [toFile(await buildBootImage({}), "boot.img")] },
    });

    await waitFor(() => expect(screen.getByText("Digests")).toBeInTheDocument());
    expect(screen.queryByText("analyze page")).toBeNull();
    expect(screen.getByText(/This tool only looks/)).toBeInTheDocument();
  });

  it("summarises a sparse image and points at the unpack tool", async () => {
    const sparse = buildSparse([{ type: "raw", blockCount: 2, data: new Uint8Array(8192).fill(0x41) }]);
    await store().analyzeFile(toFile(sparse, "boot.sparse.img"));

    renderInspect();

    expect(await screen.findByText("Container details")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Browse it in the unpack tool/ }));
    expect(await screen.findByText("unpack page")).toBeInTheDocument();
  });

  it("points a package at the extract tool", async () => {
    const zip = await buildZip([{ name: "payload.bin", data: new Uint8Array(64) }]);
    await store().analyzeFile(toFile(zip, "ota.zip"));

    renderInspect();

    expect(await screen.findByText("This is a package")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Extract from a package/ })).toBeInTheDocument();
  });
});
