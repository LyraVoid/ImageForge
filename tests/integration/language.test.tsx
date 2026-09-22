// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomePage } from "@/routes/HomePage";
import { LanguageOptions } from "@/components/ui/language-menu";
import { applyLocale, useLocaleStore } from "@/stores/locale-store";

const store = () => useLocaleStore.getState();

beforeEach(() => {
  window.localStorage.clear();
  applyLocale("en");
});

afterEach(() => {
  cleanup();
});

describe("language selection", () => {
  it("writes the language, the html lang attribute and the document title", () => {
    applyLocale("ja");

    expect(document.documentElement.lang).toBe("ja");
    expect(document.title).toBe("ImageForge — Android イメージパッチツール");
    expect(window.localStorage.getItem("imageforge.locale")).toBe("ja");

    applyLocale("zh-Hant");
    expect(document.documentElement.lang).toBe("zh-Hant");
  });

  it("switches the interface when a language is picked", () => {
    render(<LanguageOptions />);

    fireEvent.click(screen.getByRole("button", { name: "日本語" }));

    expect(store().locale).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(screen.getByRole("button", { name: "日本語" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "简体中文" })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the home page in the chosen language", () => {
    store().setLocale("zh-Hans");
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Android 镜像修补工具" })).toBeInTheDocument();
    expect(screen.getByText("把 Android 镜像拖到这里")).toBeInTheDocument();
    expect(screen.queryByText("Drop an Android image here")).toBeNull();

    cleanup();
    store().setLocale("ja");
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Android イメージパッチツール" })).toBeInTheDocument();
  });
});
