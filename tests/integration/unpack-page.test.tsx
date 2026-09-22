// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnpackPage } from "@/routes/UnpackPage";
import { useForgeStore } from "@/stores/forge-store";
import { toFile } from "../fixtures/bootimg";
import { buildSparse } from "../fixtures/sparse";
import { buildZip } from "../fixtures/zip";

const store = () => useForgeStore.getState();

function renderUnpack() {
  return render(
    <MemoryRouter initialEntries={["/tools/unpack"]}>
      <Routes>
        <Route path="/tools/unpack" element={<UnpackPage />} />
        <Route path="/tools/extract" element={<p>extract page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await store().reset();
});

afterEach(cleanup);

describe("the unpack tool", () => {
  it("asks for an image when nothing is open", () => {
    renderUnpack();

    expect(screen.getByText(/Drop a sparse image/)).toBeInTheDocument();
  });

  it("describes a sparse image and unpacks it into an artifact", async () => {
    const sparse = buildSparse([
      { type: "raw", blockCount: 2, data: new Uint8Array(8192).fill(0x41) },
      { type: "fill", blockCount: 1, fillValue: 0x11223344 },
      { type: "dont-care", blockCount: 1 },
    ]);
    await store().analyzeFile(toFile(sparse, "super.sparse.img"));
    expect(store().source?.detected.container).toBe("sparse");

    renderUnpack();

    expect(await screen.findByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // four blocks, three chunks
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Unpack to a raw image/ }));

    expect(await screen.findByText(/super-raw\.img/)).toBeInTheDocument();
    expect(store().artifacts).toHaveLength(1);
    expect(store().artifacts[0].sizeBytes).toBe(4 * 4096);
    expect(store().artifacts[0].kind).toBe("blob");
  });

  it("points a package at the extract tool", async () => {
    const zip = await buildZip([{ name: "payload.bin", data: new Uint8Array(64) }]);
    await store().analyzeFile(toFile(zip, "ota.zip"));

    renderUnpack();

    expect(await screen.findByText("This is a package; extract from it with the other tool.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Extract from a package/ }));
    expect(await screen.findByText("extract page")).toBeInTheDocument();
  });

  it("says so when the file is neither a container nor an erofs image", async () => {
    await store().analyzeFile(toFile(new Uint8Array(8192).fill(0x11), "mystery.bin"));

    renderUnpack();

    expect(
      await screen.findByText("This file is not a partition container this tool can open."),
    ).toBeInTheDocument();
  });
});
