"use client";

import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import styles from "@/app/page.module.css";

/** The landing-page chrome (brand card, title, lead) around a public account form. */
export function AuthFrame({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.brand}>
          <div className={styles.wordmark}>
            <span className={styles.mark} />
            <span className={styles.name}>Ward</span>
          </div>
          <span className={styles.tag}>{t("common.prototypeTag")}</span>
          <LanguageSwitcher tone="light" />
        </header>
        <div className={styles.intro}>
          <h1 className={styles.title}>{title}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthFrame;
