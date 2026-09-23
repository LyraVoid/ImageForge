// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExtractPage } from "@/routes/ExtractPage";
import { useForgeStore } from "@/stores/forge-store";
import { buildBootImage, toFile } from "../fixtures/bootimg";
import { buildPayload } from "../fixtures/payload";
import { buildZip } from "../fixtures/zip";

const store = () => useForgeStore.getState();

function renderExtract() {
  return render(
    <MemoryRouter initialEntries={["/tools/extract"]}>
      <Routes>
        <Route path="/tools/extract" element={<ExtractPage />} />
        <Route path="/tools/patch/analyze" element={<p>analyze page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await store().reset();
});

afterEach(cleanup);

describe("the extract tool", () => {
  it("asks for a package when nothing is open", () => {
    renderExtract();

    expect(screen.getByText(/Drop an OTA payload/)).toBeInTheDocument();
    expect(screen.getByText("OTA .zip / payload.bin / vendor .img")).toBeInTheDocument();
    expect(screen.queryByText("Drop an Android image here")).toBeNull();
  });

  it("lists a payload's partitions and hands an extracted one to the patcher", async () => {
    const payload = await buildPayload([{ name: "init_boot", data: await buildBootImage({ kernel: null }) }]);
    await store().analyzeFile(toFile(payload, "ota-payload.bin"));
    expect(store().source?.kind).toBe("package");

    renderExtract();

    expect(await screen.findByText("init_boot.img")).toBeInTheDocument();
    expect(screen.getByText("Android boot image")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    expect(await screen.findByText("Use in the patcher")).toBeInTheDocument();
    expect(store().artifacts).toHaveLength(1);
    expect(store().artifacts[0].kind).toBe("boot-container");

    fireEvent.click(screen.getByRole("button", { name: /Use in the patcher/ }));

    expect(await screen.findByText("analyze page")).toBeInTheDocument();
    expect(store().analysis?.summary.format).toBe("init_boot");
  });

  it("extracts a boot image out of a vendor archive", async () => {
    const image = await buildBootImage({});
    const zip = await buildZip([{ name: "boot.img", data: image }]);
    await store().analyzeFile(toFile(zip, "vendor.zip"));

    renderExtract();

    expect(await screen.findByText("boot.img")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    expect(await screen.findByText("Use in the patcher")).toBeInTheDocument();
    expect(store().artifacts[0].sizeBytes).toBe(image.length);
  });

  it("reports a damaged blob instead of handing over a wrong image", async () => {
    const payload = await buildPayload([{ name: "boot", data: await buildBootImage({}) }]);
    // corrupt the last byte of the blob: the manifest still parses, the digest check does not pass
    payload[payload.length - 1] ^= 0xff;
    await store().analyzeFile(toFile(payload, "damaged.bin"));

    renderExtract();
    expect(await screen.findByText("boot.img")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/digest/);
    expect(store().artifacts).toHaveLength(0);
  });
});
