import { useMemo } from "react";
import { useLocaleStore } from "@/stores/locale-store";
import { createTranslator } from "./translate";
import type { Translator } from "./translate";
import { translateRecord } from "./record";
import type { Locale } from "./locales";

/** The translator of the current language. Components re-render when the language changes. */
export function useT(): Translator {
  const catalog = useLocaleStore((state) => state.catalog);
  return useMemo(() => createTranslator(catalog), [catalog]);
}

export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale);
}

/** Looks up prose the engine produced, falling back to the English source string. */
export function useRecordText(): (text: string) => string {
  const record = useLocaleStore((state) => state.record);
  return useMemo(() => (text: string) => translateRecord(record, text), [record]);
}
