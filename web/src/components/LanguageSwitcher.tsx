"use client";

import { useRouter } from "next/navigation";
import { LANG_NAMES, LANG_SHORT, LANGS } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import styles from "./LanguageSwitcher.module.css";

export interface LanguageSwitcherProps {
  /** "dark" on the ink sidebar, "light" on paper (sign-in, patient app). */
  tone?: "dark" | "light";
  /** Short labels (EN · FR · ع) with the full name as a tooltip. */
  compact?: boolean;
}

/** English · Français · العربية. Saves the choice in a cookie and re-renders server text. */
export function LanguageSwitcher({ tone = "light", compact = false }: LanguageSwitcherProps) {
  const { t, lang, setLang } = useT();
  const router = useRouter();
  return (
    <div role="group" aria-label={t("common.language")} className={`${styles.root} ${styles[tone]}`}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === lang}
          title={LANG_NAMES[l]}
          className={styles.btn}
          onClick={() => {
            if (l === lang) return;
            setLang(l);
            router.refresh();
          }}
        >
          {compact ? LANG_SHORT[l] : LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}

export default LanguageSwitcher;
