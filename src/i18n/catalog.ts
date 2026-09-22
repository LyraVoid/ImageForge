import { en } from "./messages/en";
import type { Messages } from "./messages/en";
import type { Locale } from "./locales";
import { ENGLISH_RECORD } from "./record";
import type { RecordTable } from "./record";

/** One language, ready to render: the interface messages plus the engine prose table. */
export interface LoadedLocale {
  messages: Messages;
  record: RecordTable;
}

/**
 * English is always part of the bundle: it is the source of truth for the key union and the
 * fallback for anything a translation misses. The other languages are imported when one is
 * selected, so a first visit carries one language instead of four.
 */
export const ENGLISH_CATALOG: LoadedLocale = { messages: en, record: ENGLISH_RECORD };

const LOADERS: Record<Exclude<Locale, "en">, () => Promise<LoadedLocale>> = {
  "zh-Hans": async () => {
    const [messages, record] = await Promise.all([
      import("./messages/zh-Hans"),
      import("./record/zh-Hans"),
    ]);
    return { messages: messages.zhHans, record: record.zhHans };
  },
  "zh-Hant": async () => {
    const [messages, record] = await Promise.all([
      import("./messages/zh-Hant"),
      import("./record/zh-Hant"),
    ]);
    return { messages: messages.zhHant, record: record.zhHant };
  },
  ja: async () => {
    const [messages, record] = await Promise.all([import("./messages/ja"), import("./record/ja")]);
    return { messages: messages.ja, record: record.ja };
  },
};

export function loadLocale(locale: Locale): Promise<LoadedLocale> {
  if (locale === "en") return Promise.resolve(ENGLISH_CATALOG);
  return LOADERS[locale]();
}
