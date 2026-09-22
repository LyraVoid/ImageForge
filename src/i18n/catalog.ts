import { en } from "./messages/en";
import type { Messages } from "./messages/en";
import { zhHans } from "./messages/zh-Hans";
import { zhHant } from "./messages/zh-Hant";
import { ja } from "./messages/ja";
import type { Locale } from "./locales";

/**
 * Every catalogue has to be complete: a message that is missing in one language is a visible hole
 * in that language, and the type system refuses it. A message that is deliberately untranslated
 * would have to be dropped from the English catalogue as well, which is the point.
 */
export const MESSAGES: Record<Locale, Messages> = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ja,
};
