import { DEFAULT_LOCALE, isLocale } from "./locales";
import type { Locale } from "./locales";
import { MESSAGES } from "./catalog";
import type { MessageKey } from "./messages/en";

export type MessageParams = Record<string, string | number>;

/** A message lookup bound to one locale. */
export type Translator = (key: MessageKey, params?: MessageParams) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Replaces {name} placeholders. A missing parameter is left in place on purpose: a visible
 * "{size}" in the interface is a bug report, an empty string is a silent one.
 */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(locale: Locale): Translator {
  const catalog = MESSAGES[locale];
  const fallback = MESSAGES[DEFAULT_LOCALE];
  return (key, params) => {
    const template = catalog[key] ?? fallback[key];
    return interpolate(template, params);
  };
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return createTranslator(locale)(key, params);
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Every placeholder a message declares, in order. */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}
