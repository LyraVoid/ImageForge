import { en } from "./messages/en";
import type { MessageKey, Messages } from "./messages/en";

export type MessageParams = Record<string, string | number>;

/** A message lookup bound to one language's catalogue. */
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

/**
 * A catalogue is complete by type, so the English fallback only covers a lookup that is not a
 * MessageKey at all (a stale key in a running session, for example).
 */
export function createTranslator(catalog: Messages): Translator {
  return (key, params) => interpolate(catalog[key] ?? en[key], params);
}

/** Every placeholder a message declares, in order. */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}
