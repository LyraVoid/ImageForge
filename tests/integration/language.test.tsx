// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomePage } from "@/routes/HomePage";
import { LanguageOptions } from "@/components/ui/language-menu";
import { useLocaleStore } from "@/stores/locale-store";

const store = () => useLocaleStore.getState();

beforeEach(async () => {
  window.localStorage.clear();
  store().setLocale("en");
  await store().ensureLoaded("en");
});

afterEach(() => {
  cleanup();
});

describe("language selection", () => {
  it("writes the language, the html lang attribute and the document title", async () => {
    await store().ensureLoaded("ja");

    expect(document.documentElement.lang).toBe("ja");
    expect(document.title).toBe("ImageForge — Android イメージパッチツール");
    expect(window.localStorage.getItem("imageforge.locale")).toBe("ja");
  });

  it("switches the interface when a language is picked", async () => {
    render(<LanguageOptions />);

    fireEvent.click(screen.getByRole("button", { name: "日本語" }));

    expect(store().locale).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(screen.getByRole("button", { name: "日本語" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "简体中文" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the current language until the new catalogue is loaded", async () => {
    render(<LanguageOptions />);
    // English is bundled, so it is what a first visit renders
    expect(store().catalog["step.patch"]).toBe("Patch");

    await store().ensureLoaded("zh-Hans");
    expect(store().catalog["step.patch"]).toBe("修补");
  });

  it("renders the home page in the chosen language", async () => {
    store().setLocale("zh-Hans");
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Android 镜像修补工具" })).toBeInTheDocument();
    expect(screen.getByText("把 Android 镜像拖到这里")).toBeInTheDocument();
    expect(screen.queryByText("Drop an Android image here")).toBeNull();
  });

  it("renders the home page in Japanese after the catalogue loads", async () => {
    store().setLocale("ja");
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Android イメージパッチツール" })).toBeInTheDocument();
  });
});
