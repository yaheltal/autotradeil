import { I18n } from "i18n-js";

import en from "@/locales/en.json";
import he from "@/locales/he.json";

/**
 * App language is Hebrew by default — that's the product direction. The
 * device locale is intentionally NOT auto-detected; users opt into English
 * explicitly from Settings (see `localeStore`). This makes the app
 * behave the same on every phone regardless of OS language, and matches
 * the dealer audience.
 *
 * The active locale is mutated at runtime via `setI18nLocale`. Components
 * re-render via `localeStore` + a `key={locale}` boundary in _layout.tsx,
 * so the entire UI swaps strings on toggle without an app restart.
 */
const i18n = new I18n({ he, en });
i18n.defaultLocale = "he";
i18n.enableFallback = true;
i18n.locale = "he";

export type AppLocale = "he" | "en";

export function setI18nLocale(locale: AppLocale): void {
  i18n.locale = locale;
}

export const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

export const isRtl = () =>
  i18n.locale.startsWith("he") || i18n.locale.startsWith("ar");

export default i18n;
