export type Locale = "en" | "zh-Hans" | "zh-Hant" | "ja";

export interface LocaleDefinition {
  id: Locale;
  /** The language's own name, which is what a language picker should show. */
  label: string;
  englishLabel: string;
  /** The value written to the html lang attribute. */
  htmlLang: string;
  /** Tags matched against the browser's language list, most specific first. */
  tags: string[];
}

export const LOCALES: readonly LocaleDefinition[] = [
  {
    id: "en",
    label: "English",
    englishLabel: "English",
    htmlLang: "en",
    tags: ["en"],
  },
  {
    id: "zh-Hans",
    label: "简体中文",
    englishLabel: "Simplified Chinese",
    htmlLang: "zh-Hans",
    tags: ["zh-hans", "zh-cn", "zh-sg", "zh-my", "zh"],
  },
  {
    id: "zh-Hant",
    label: "繁體中文",
    englishLabel: "Traditional Chinese",
    htmlLang: "zh-Hant",
    tags: ["zh-hant", "zh-tw", "zh-hk", "zh-mo"],
  },
  {
    id: "ja",
    label: "日本語",
    englishLabel: "Japanese",
    htmlLang: "ja",
    tags: ["ja"],
  },
];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_STORAGE_KEY = "imageforge.locale";

const BY_ID = new Map<Locale, LocaleDefinition>(LOCALES.map((entry) => [entry.id, entry]));

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && BY_ID.has(value as Locale);
}

export function localeDefinition(locale: Locale): LocaleDefinition {
  const found = BY_ID.get(locale);
  if (!found) throw new Error("Unknown locale " + locale + ".");
  return found;
}

/**
 * Maps a browser language list onto a supported locale. Tags are compared in the order the
 * browser reports them, so an explicit preference wins over a general one. A bare "zh" means
 * Simplified: it is what the overwhelming majority of "zh" clients use, and the picker is one
 * click away for the rest.
 */
export function matchLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase().split(";")[0].trim();
    if (normalized === "") continue;
    // "ja-JP" is not in any list, but its script and region subtags are dropped one by one so
    // that a regional tag still finds its language.
    const parts = normalized.split("-");
    for (let length = parts.length; length > 0; length -= 1) {
      const candidate = parts.slice(0, length).join("-");
      for (const locale of LOCALES) {
        if (locale.tags.includes(candidate)) return locale.id;
      }
    }
  }
  return null;
}

export function detectLocale(tags?: readonly string[]): Locale {
  const list =
    tags ??
    (typeof navigator === "undefined"
      ? []
      : [...(navigator.languages ?? []), navigator.language].filter(
          (value): value is string => typeof value === "string" && value !== "",
        ));
  return matchLocale(list) ?? DEFAULT_LOCALE;
}
