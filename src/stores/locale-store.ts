import { useEffect } from "react";
import { create } from "zustand";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, detectLocale, isLocale, localeDefinition } from "@/i18n/locales";
import { ENGLISH_CATALOG, loadLocale } from "@/i18n/catalog";
import { createTranslator } from "@/i18n/translate";
import type { Translator } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages/en";
import type { RecordTable } from "@/i18n/record";
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

/** Writes everything that does not depend on the catalogue being loaded yet. */
export function applyLocale(locale: Locale, catalog: Messages = ENGLISH_CATALOG.messages): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = localeDefinition(locale).htmlLang;
  document.title = createTranslator(catalog)("app.title");
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // the language still applies for this session
  }
}

interface LocaleState {
  locale: Locale;
  /** Messages of the current language; English until the selected catalogue arrives. */
  catalog: Messages;
  record: RecordTable;
  setLocale: (locale: Locale) => void;
  ensureLoaded: (locale: Locale) => Promise<void>;
}

/** Guards against a slow load overwriting the catalogue of a newer selection. */
let loadToken = 0;

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: readStoredLocale(),
  catalog: ENGLISH_CATALOG.messages,
  record: ENGLISH_CATALOG.record,

  setLocale: (locale) => {
    if (locale === get().locale) return;
    // The html lang and the stored preference follow immediately; the text follows the import.
    applyLocale(locale, get().catalog);
    set({ locale });
    void get().ensureLoaded(locale);
  },

  ensureLoaded: async (locale) => {
    const token = (loadToken += 1);
    const loaded = await loadLocale(locale);
    if (token !== loadToken) return;
    set({ catalog: loaded.messages, record: loaded.record });
    applyLocale(locale, loaded.messages);
  },
}));

/** Loads the catalogue of the current language and applies it. */
export function useLocaleSync(): void {
  const locale = useLocaleStore((state) => state.locale);
  const ensureLoaded = useLocaleStore((state) => state.ensureLoaded);

  useEffect(() => {
    void ensureLoaded(locale);
  }, [ensureLoaded, locale]);
}

/** The translator of the current language, for code that runs outside a component. */
export function currentTranslator(): Translator {
  return createTranslator(useLocaleStore.getState().catalog);
}
