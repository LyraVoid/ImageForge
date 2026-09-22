// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultPage } from "@/routes/ResultPage";
import { forgeDiagnostics, forgeFactsFromStore } from "@/lib/forge-facts";
import { diagnosticsJson } from "@/lib/diagnostics";
import { useLocaleStore } from "@/stores/locale-store";
import { useForgeStore } from "@/stores/forge-store";
import { fakeAnalysis, fakeOutput, fakePlan } from "../fixtures/forge";

function renderResult() {
  return render(
    <MemoryRouter>
      <ResultPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  useLocaleStore.getState().setLocale("en");
  await useLocaleStore.getState().ensureLoaded("en");
  useForgeStore.setState({
    output: fakeOutput(),
    analysis: fakeAnalysis(),
    planResponse: { plan: fakePlan(), providerNotes: [] },
    error: null,
  });
});

afterEach(cleanup);

describe("result page readiness checklist", () => {
  it("spells out the consequences of the run before the image is used", () => {
    renderResult();

    expect(screen.getByText("Before you write it to a device")).toBeInTheDocument();
    expect(screen.getByText("The produced image is a boot image and belongs in the boot partition.")).toBeInTheDocument();
    expect(
      screen.getByText("me.bmax.apatch has to be installed on the device: it is the only manager this image trusts."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The AVB signature was dropped, so verified boot fails unless you re-sign the image or disable verification.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Only the kernel section was patched; every other section, the ramdisk included, is byte for byte what you supplied.")).toBeInTheDocument();
    expect(screen.getByText("All 2 checks passed. Plan id: " + "1".repeat(32) + ".")).toBeInTheDocument();
  });

  it("follows the interface language", async () => {
    useLocaleStore.getState().setLocale("ja");
    renderResult();

    expect(await screen.findByText("デバイスに書き込む前のチェックリスト")).toBeInTheDocument();
    expect(screen.getByText("対象パーティション")).toBeInTheDocument();
  });

  it("marks a ramdisk patch as a ramdisk patch and warns about the manager", () => {
    useForgeStore.setState({
      output: fakeOutput({
        plan: fakePlan({ providerId: "kernelsu", providerName: "KernelSU", requiredManager: undefined } as never),
        metadata: { requiredManager: "me.weishu.kernelsu", moduleEntry: "kernelsu.ko", keepSignature: "true" },
      }),
    });
    renderResult();

    expect(screen.getByText("Only the ramdisk was patched; the kernel is byte for byte what you supplied.")).toBeInTheDocument();
    expect(
      screen.getByText("The stale AVB bytes of the source image were kept; they are invalid after a patch either way, so verified boot fails unless you re-sign the image or disable verification."),
    ).toBeInTheDocument();
    // the manager the image requires is one click away from its official release
    const link = screen.getByRole("link", { name: /Get KernelSU from its official release/ });
    expect(link).toHaveAttribute("href", "https://github.com/tiann/KernelSU/releases");
    expect(link).toHaveAttribute("target", "_blank");
  });
});

describe("diagnostics export", () => {
  it("exports what the store holds and nothing it does not", () => {
    const secret = "s3cret-superkey-value";
    useForgeStore.setState({
      providerOptions: { configuration: { superkey: secret } },
      attachments: [{ name: "module.kpm", bytes: new Uint8Array([1, 2, 3]) }],
    });

    const json = diagnosticsJson(forgeDiagnostics("en", forgeFactsFromStore()));

    expect(json).toContain("1".repeat(32));
    expect(json).toContain("kernelSizeAfter");
    expect(json).not.toContain(secret);
    expect(json).not.toContain("module.kpm");
    // only the *mode* is recorded; a field actually carrying the key must never exist
    const keys: string[] = [];
    JSON.stringify(JSON.parse(json), (key, value) => {
      keys.push(key);
      return value as unknown;
    });
    expect(keys).not.toContain("superkey");
    expect(keys).not.toContain("bytes");
  });

  it("writes the report to a file when the button is pressed", () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:diagnostics");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    renderResult();

    screen.getByRole("button", { name: /Export diagnostics/ }).click();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/json");
    vi.unstubAllGlobals();
  });
});
