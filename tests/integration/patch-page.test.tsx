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
    <MemoryRouter initialEntries={["/tools/patch/plan"]}>
      <Routes>
        <Route path="/tools/patch/plan" element={<PatchPage />} />
        <Route path="/tools/patch/analyze" element={<p>analyze page</p>} />
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

  it("lets the Magisk flavour be chosen, and the plan follows it", async () => {
    await store().selectProvider("magisk");
    renderPatchPage();

    expect(await screen.findByText("Magisk options")).toBeInTheDocument();
    const manager = screen.getByLabelText("Manager");
    expect([...manager.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "Magisk · official Magisk release v30.7",
      "MagisKube · MagisKube release 1.0.0 (a fork of Magisk on the same v30.7 base)",
      "WeaveMask · WeaveMask release v30.7.5, a fork of Magisk",
    ]);

    fireEvent.change(manager, { target: { value: "weavemask" } });

    await waitFor(() => expect(store().planResponse?.plan.configuration.magiskFlavor).toBe("weavemask"));
    // the plan pins WeaveMask's own payloads and the manager that trusts them
    expect(store().planResponse?.plan.configuration.requiredManager).toBe("io.github.seyud.weave");
    expect(store().planResponse?.plan.artifact.id).toBe("weavemask-magiskinit");
    expect(store().planResponse?.plan.configuration.magiskArtifacts).toContain("weavemask-magisk");
  }, 60000);
});
describe("patch page: the KernelSU family", () => {
  beforeEach(async () => {
    await store().reset();
    const bytes = await buildBootImage({});
    await store().analyzeFile(toFile(bytes, "boot.img"));
  });

  it("offers every manager of the family and plans for the chosen one", async () => {
    await store().selectProvider("kernelsu");
    renderPatchPage();

    const manager = await screen.findByLabelText("Manager");
    expect([...manager.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "KernelSU · official KernelSU release v3.3.0",
      "SukiSU · SukiSU-Ultra release v4.2.0 (the same wrapper as upstream, its own modules)",
      "ReSukiSU · ReSukiSU release v4.2.0-rc3 (wrapper and modules recovered from its APK)",
      "YukiSU · YukiSU release v1.7.0 (its modules are release assets, its wrapper comes from its APK)",
      "KowSU · KowSU Manager build 32737 (wrapper and modules recovered from its APK)",
    ]);

    fireEvent.change(manager, { target: { value: "koyeb" } });
    await waitFor(() => expect(store().planResponse?.plan.configuration.kernelsuManager).toBe("kernelsu"));

    fireEvent.change(manager, { target: { value: "yukisu" } });
    await waitFor(() => expect(store().planResponse?.plan.configuration.kernelsuManager).toBe("yukisu"));
    expect(store().planResponse?.plan.configuration.requiredManager).toBe("com.anatdx.yukisu");
  }, 60000);
});
