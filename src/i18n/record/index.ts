import type { Locale } from "../locales";

/** The engine prose of one language, keyed by the English source string (gettext style). */
export type RecordTable = Record<string, string>;

export type RecordLocale = Exclude<Locale, "en">;

/** English is the source language: its table is the identity, so it holds nothing. */
export const ENGLISH_RECORD: RecordTable = {};

export function translateRecord(record: RecordTable, text: string): string {
  return record[text] ?? text;
}
