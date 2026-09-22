import { useMemo } from "react";
import { useLocaleStore } from "@/stores/locale-store";
import { createTranslator } from "./translate";
import type { Translator } from "./translate";
import { translateRecord } from "./record";
import type { Locale } from "./locales";

/** The translator of the current language. Components re-render when the language changes. */
export function useT(): Translator {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => createTranslator(locale), [locale]);
}

export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale);
}

/** Looks up prose the engine produced, falling back to the English source string. */
export function useRecordText(): (text: string) => string {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => (text: string) => translateRecord(locale, text), [locale]);
}
