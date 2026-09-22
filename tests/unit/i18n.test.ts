import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, detectLocale, isLocale, localeDefinition, matchLocale } from "@/i18n/locales";
import { ENGLISH_CATALOG, loadLocale } from "@/i18n/catalog";
import { MESSAGE_KEYS, en } from "@/i18n/messages/en";
import { createTranslator, interpolate, placeholdersOf } from "@/i18n/translate";
import { ENGLISH_RECORD, translateRecord } from "@/i18n/record";
import { zhHans } from "@/i18n/record/zh-Hans";
import { zhHant } from "@/i18n/record/zh-Hant";
import { ja } from "@/i18n/record/ja";
import { CHECK_KEYS, REASON_KEYS, WARNING_KEYS } from "@/i18n/engine-keys";

const LOCALE_IDS = LOCALES.map((entry) => entry.id);
const RECORD_TABLES = { "zh-Hans": zhHans, "zh-Hant": zhHant, ja };
/** Messages that are legitimately spelled the same in every language. */
const IDENTICAL_ALLOWED = 15;

describe("translation catalogues", () => {
  it("declares a locale per supported language, English included", () => {
    expect(LOCALE_IDS).toEqual(["en", "zh-Hans", "zh-Hant", "ja"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(localeDefinition("zh-Hant").htmlLang).toBe("zh-Hant");
    expect(localeDefinition("ja").htmlLang).toBe("ja");
  });

  it("ships English without importing another language", () => {
    expect(ENGLISH_CATALOG.messages).toBe(en);
    // the English record table is the identity: nothing to translate
    expect(ENGLISH_RECORD).toEqual({});
    expect(translateRecord(ENGLISH_RECORD, "Kernel")).toBe("Kernel");
    expect(translateRecord(ja, "Kernel")).toBe("カーネル");
  });

  it("has every message key in every language", async () => {
    for (const locale of LOCALE_IDS) {
      const { messages } = await loadLocale(locale);
      expect(Object.keys(messages).sort()).toEqual([...MESSAGE_KEYS].sort());
      for (const key of MESSAGE_KEYS) {
        expect(typeof messages[key], locale + " " + key).toBe("string");
        expect(messages[key].trim(), locale + " " + key).not.toBe("");
      }
    }
  });

  it("keeps the placeholders of a message identical across languages", async () => {
    for (const locale of LOCALE_IDS) {
      const { messages } = await loadLocale(locale);
      for (const key of MESSAGE_KEYS) {
        expect(placeholdersOf(messages[key]), locale + " " + key).toEqual(placeholdersOf(en[key]));
      }
    }
  });

  it("actually translates rather than copying English", async () => {
    for (const locale of ["zh-Hans", "zh-Hant", "ja"] as const) {
      const { messages } = await loadLocale(locale);
      const identical = MESSAGE_KEYS.filter((key) => messages[key] === en[key]);
      expect(identical.length, locale + " still English: " + identical.slice(0, 5).join(", ")).toBeLessThan(
        IDENTICAL_ALLOWED,
      );
    }
  });

  it("words the engine verdict codes in every language", () => {
    for (const table of [REASON_KEYS, WARNING_KEYS, CHECK_KEYS]) {
      for (const key of Object.values(table)) {
        expect(MESSAGE_KEYS).toContain(key);
      }
    }
    expect(Object.keys(REASON_KEYS).sort()).toEqual([
      "architecture",
      "format",
      "header",
      "no-kernel",
      "no-ramdisk",
      "no-release",
      "not-implemented",
    ]);
  });
});

describe("engine record tables", () => {
  it("carries the same source keys in every translated language", () => {
    const [reference, ...others] = Object.values(RECORD_TABLES);
    const keys = Object.keys(reference).sort();
    expect(keys.length).toBeGreaterThan(100);
    for (const table of others) {
      expect(Object.keys(table).sort()).toEqual(keys);
      for (const value of Object.values(table)) expect(value.trim()).not.toBe("");
    }
  });

  it("falls back to the English source sentence for prose it does not know", () => {
    expect(translateRecord(ja, "Repacking the image with 12 bytes")).toBe("Repacking the image with 12 bytes");
  });
});

describe("locale resolution", () => {
  it("maps browser language tags onto a supported language", () => {
    expect(matchLocale(["zh-TW"])).toBe("zh-Hant");
    expect(matchLocale(["zh-HK"])).toBe("zh-Hant");
    expect(matchLocale(["zh-CN"])).toBe("zh-Hans");
    expect(matchLocale(["zh"])).toBe("zh-Hans");
    expect(matchLocale(["ja-JP"])).toBe("ja");
    expect(matchLocale(["en-GB"])).toBe("en");
    expect(matchLocale(["de-DE"])).toBeNull();
  });

  it("prefers the first tag the browser reports and falls back to English", () => {
    expect(detectLocale(["de", "ja-JP"])).toBe("ja");
    expect(detectLocale(["fr-FR"])).toBe("en");
    expect(detectLocale([])).toBe("en");
    expect(isLocale("zh-Hant")).toBe(true);
    expect(isLocale("zh-Hant-TW")).toBe(false);
  });
});

describe("message lookup", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(interpolate("{count} files in {name}", { count: 3, name: "boot.img" })).toBe("3 files in boot.img");
    expect(interpolate("{missing} stays")).toBe("{missing} stays");
    expect(interpolate("no placeholders", { count: 1 })).toBe("no placeholders");
  });

  it("translates a key per language", async () => {
    expect(createTranslator(en)("step.patch")).toBe("Patch");
    expect(createTranslator((await loadLocale("zh-Hans")).messages)("step.patch")).toBe("修补");
    expect(createTranslator((await loadLocale("zh-Hant")).messages)("step.patch")).toBe("修補");
    expect(createTranslator((await loadLocale("ja")).messages)("step.patch")).toBe("パッチ");
  });

  it("interpolates through the translator", async () => {
    expect(createTranslator((await loadLocale("ja")).messages)("patch.field.pageSize")).toBe("ページサイズ");
    expect(createTranslator(en)("patch.planValue", { value: "none" })).toBe("plan: none");
  });
});
