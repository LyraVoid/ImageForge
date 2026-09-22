// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { PatchPage } from "@/routes/PatchPage";
import { useForgeStore } from "@/stores/forge-store";
import { buildBootImage, toFile } from "../fixtures/bootimg";

const store = () => useForgeStore.getState();

function renderPatchPage() {
  return render(
    <MemoryRouter initialEntries={["/patch"]}>
      <Routes>
        <Route path="/patch" element={<PatchPage />} />
        <Route path="/analyze" element={<p>analyze page</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("patch page re-planning", () => {
  beforeEach(async () => {
    await store().reset();
    const bytes = await buildBootImage({});
    await store().analyzeFile(toFile(bytes, "boot.img"));
  });

  it("stays on the page instead of redirecting while the plan is rebuilt", async () => {
    await store().selectProvider("mock");
    // This is the state the store enters when an output option triggers a re-plan.
    useForgeStore.setState({ planResponse: null, isBusy: true });

    renderPatchPage();

    expect(await screen.findByText(/Building the patch plan/i)).toBeInTheDocument();
    expect(screen.queryByText("analyze page")).toBeNull();
    expect(screen.queryByText("home page")).toBeNull();
  }, 60000);

  it("shows the plan once it is available", async () => {
    await store().selectProvider("mock");
    renderPatchPage();

    expect(await screen.findByText(/Patch plan/i)).toBeInTheDocument();
    expect(screen.getByText("imageforge-mock-artifact@1.0.0")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /preserve the original image size/i })).toBeInTheDocument();
  }, 60000);

  it("still redirects to the analysis page when there is no plan and nothing is running", async () => {
    renderPatchPage();

    expect(await screen.findByText("analyze page")).toBeInTheDocument();
  }, 60000);

  it("offers the Magisk options and turns them into plan configuration", async () => {
    await store().selectProvider("magisk");
    renderPatchPage();

    expect(await screen.findByText("Magisk options")).toBeInTheDocument();
    expect(screen.getByLabelText("Pre-init storage (PREINITDEVICE)")).toBeInTheDocument();

    const keepVerity = screen.getByLabelText("Keep verity (KEEPVERITY)");
    expect(keepVerity).toBeChecked();
    fireEvent.click(keepVerity);

    await waitFor(() => expect(store().planResponse?.plan.configuration.keepVerity).toBe("false"));
    // the other option is untouched, and the plan still pins the default
    expect(store().planResponse?.plan.configuration.keepForceEncrypt).toBe("true");
  }, 60000);
});