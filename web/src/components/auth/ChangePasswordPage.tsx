"use client";

import { useT } from "@/i18n/I18nProvider";
import { ChangePasswordForm } from "./ChangePasswordForm";
import auth from "./Auth.module.css";

/** Title + form inside a role shell's main area. */
export function ChangePasswordPage() {
  const { t } = useT();
  return (
    <div className={auth.pageWrap}>
      <h2 className={auth.pageTitle}>{t("auth.pwTitle")}</h2>
      <p className={auth.hint}>{t("auth.pwLead")}</p>
      <ChangePasswordForm />
    </div>
  );
}

export default ChangePasswordPage;
