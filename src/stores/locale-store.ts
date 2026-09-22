import { useEffect } from "react";
import { create } from "zustand";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, detectLocale, isLocale, localeDefinition } from "@/i18n/locales";
import { translate } from "@/i18n/translate";
import type { Locale } from "@/i18n/locales";

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // storage can be unavailable in private modes; detection still applies
  }
  return detectLocale();
}

export function applyLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = localeDefinition(locale).htmlLang;
  document.title = translate(locale, "app.title");
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // the language still applies for this session
  }
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: readStoredLocale(),
  setLocale: (locale) => {
    applyLocale(locale);
    set({ locale });
  },
}));

export function useLocaleSync(): void {
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);
}
