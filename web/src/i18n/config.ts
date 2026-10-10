// Interface languages. The choice lives in the `ward_lang` cookie so the server
// renders the right `<html lang dir>` on the first paint.

export const LANGS = ["en", "fr", "ar"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "ward_lang";

/** Each language's name in its own script (the switcher's labels). */
export const LANG_NAMES: Record<Lang, string> = { en: "English", fr: "Français", ar: "العربية" };
/** Short switcher labels. */
export const LANG_SHORT: Record<Lang, string> = { en: "EN", fr: "FR", ar: "ع" };

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

export function dirOf(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** Intl locale per language. ar-TN keeps Latin digits, as Tunisian hospitals write them. */
export function localeOf(lang: Lang): string {
  return lang === "fr" ? "fr-TN" : lang === "ar" ? "ar-TN" : "en-GB";
}
