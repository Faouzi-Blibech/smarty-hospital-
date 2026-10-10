"use client";

import { useT } from "@/i18n/I18nProvider";
import { PendingList } from "./PendingList";
import page from "./AdminPage.module.css";

export function PendingView() {
  const { t } = useT();
  return (
    <div className={page.page}>
      <div className={page.head}>
        <div className={page.titles}>
          <h2 className={page.h2}>{t("accounts.pendingTitle")}</h2>
          <span className={page.sub}>{t("accounts.pendingSub")}</span>
        </div>
      </div>
      <PendingList viewer="admin" />
    </div>
  );
}

export default PendingView;
