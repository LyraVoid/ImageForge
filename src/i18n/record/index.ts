import { zhHans } from "./zh-Hans";
import { zhHant } from "./zh-Hant";
import { ja } from "./ja";
import type { Locale } from "../locales";

export type RecordLocale = Exclude<Locale, "en">;

/**
 * Prose the engine produces: report labels and hints, provider descriptions and notes, pipeline
 * stage labels and the warnings a run reports. It is keyed by its English source string, the way
 * gettext keys a message by its msgid, because the engine owns that text and does not know about
 * languages. English needs no table: a miss falls back to the source string, which is also what
 * happens for the dynamic sentences (they carry a file name or a digest) that cannot be a key.
 */
export const RECORD_MESSAGES: Record<RecordLocale, Record<string, string>> = {
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ja,
};

export function translateRecord(locale: Locale, text: string): string {
  if (locale === "en") return text;
  return RECORD_MESSAGES[locale][text] ?? text;
}

export function hasRecordMessage(locale: RecordLocale, text: string): boolean {
  return Object.hasOwn(RECORD_MESSAGES[locale], text);
}
