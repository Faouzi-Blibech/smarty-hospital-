import { cookies } from "next/headers";
import { DEFAULT_LANG, dirOf, isLang, LANG_COOKIE, type Lang } from "./config";
import { translate, type TFn } from "./messages";

/** The language from the `ward_lang` cookie (server components and layouts). */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

export async function getT(): Promise<{ t: TFn; lang: Lang; dir: "ltr" | "rtl" }> {
  const lang = await getLang();
  return { t: (key, vars) => translate(lang, key, vars), lang, dir: dirOf(lang) };
}
