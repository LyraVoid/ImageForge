import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, detectLocale, isLocale, localeDefinition, matchLocale } from "@/i18n/locales";
import { MESSAGES } from "@/i18n/catalog";
import { MESSAGE_KEYS, en } from "@/i18n/messages/en";
import { interpolate, placeholdersOf, translate } from "@/i18n/translate";
import { RECORD_MESSAGES } from "@/i18n/record";
import { CHECK_KEYS, REASON_KEYS, WARNING_KEYS } from "@/i18n/engine-keys";

const LOCALE_IDS = LOCALES.map((entry) => entry.id);
/** Messages that are legitimately spelled the same in every language. */
const IDENTICAL_ALLOWED = 15;

describe("translation catalogues", () => {
  it("declares a locale per supported language, English included", () => {
    expect(LOCALE_IDS).toEqual(["en", "zh-Hans", "zh-Hant", "ja"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(localeDefinition("zh-Hant").htmlLang).toBe("zh-Hant");
    expect(localeDefinition("ja").htmlLang).toBe("ja");
  });

  it("has every message key in every language", () => {
    for (const locale of LOCALE_IDS) {
      const catalog = MESSAGES[locale];
      expect(Object.keys(catalog).sort()).toEqual([...MESSAGE_KEYS].sort());
      for (const key of MESSAGE_KEYS) {
        const value = catalog[key];
        expect(typeof value, locale + " " + key).toBe("string");
        expect(value.trim(), locale + " " + key).not.toBe("");
      }
    }
  });

  it("keeps the placeholders of a message identical across languages", () => {
    for (const key of MESSAGE_KEYS) {
      const expected = placeholdersOf(en[key]);
      for (const locale of LOCALE_IDS) {
        expect(placeholdersOf(MESSAGES[locale][key]), locale + " " + key).toEqual(expected);
      }
    }
  });

  it("actually translates rather than copying English", () => {
    for (const locale of ["zh-Hans", "zh-Hant", "ja"] as const) {
      const identical = MESSAGE_KEYS.filter((key) => MESSAGES[locale][key] === en[key]);
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
    // every reason and warning code the compatibility engine can emit has a message
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
    const [reference, ...others] = Object.values(RECORD_MESSAGES);
    const keys = Object.keys(reference).sort();
    expect(keys.length).toBeGreaterThan(100);
    for (const table of others) {
      expect(Object.keys(table).sort()).toEqual(keys);
      for (const value of Object.values(table)) expect(value.trim()).not.toBe("");
    }
  });

  it("falls back to the English source sentence for prose it does not know", () => {
    expect(RECORD_MESSAGES.ja["Kernel"]).toBe("カーネル");
    expect(RECORD_MESSAGES.ja["Repacking the image with 12 bytes"]).toBeUndefined();
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

  it("translates a key per language", () => {
    expect(translate("en", "step.patch")).toBe("Patch");
    expect(translate("zh-Hans", "step.patch")).toBe("修补");
    expect(translate("zh-Hant", "step.patch")).toBe("修補");
    expect(translate("ja", "step.patch")).toBe("パッチ");
  });

  it("interpolates through the translator", () => {
    expect(translate("ja", "patch.field.pageSize")).toBe("ページサイズ");
    expect(translate("en", "patch.planValue", { value: "none" })).toBe("plan: none");
  });
});
