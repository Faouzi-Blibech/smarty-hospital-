"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useT } from "@/i18n/I18nProvider";
import { describeError, normalizeCode, passwordProblem, type ErrorInfo } from "@/lib/accountsUi";
import { resetPassword } from "@/lib/api";
import { AuthFrame } from "./AuthFrame";
import auth from "./Auth.module.css";
import styles from "@/app/page.module.css";

const PASSWORD_ERRORS = {
  short: "auth.errPasswordShort",
  long: "auth.errPasswordLong",
  personal: "auth.errPasswordPersonal",
  mismatch: "auth.errPasswordMismatch",
} as const;

export function ResetForm() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = passwordProblem(pw, confirm, email.trim());
    if (problem) {
      setError({ key: PASSWORD_ERRORS[problem], detail: null });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword({ email: email.trim(), code: normalizeCode(code), new_password: pw });
      setPw("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <AuthFrame title={t("auth.resetTitle")}>
        <div className={auth.done} role="status">
          <h2 className={auth.doneTitle}>{t("auth.resetDoneTitle")}</h2>
          <p className={auth.doneBody}>{t("auth.resetDoneBody")}</p>
          <Link href="/" className={auth.back}>
            {t("auth.backToSignIn")}
          </Link>
        </div>
      </AuthFrame>
    );

  return (
    <AuthFrame title={t("auth.resetTitle")} lead={t("auth.resetLead")}>
      <form className={styles.login} onSubmit={submit} aria-label={t("auth.resetTitle")}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldEmail")}</span>
          <input type="email" dir="ltr" required autoComplete="username" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldCode")}</span>
          <input dir="ltr" required autoComplete="off" autoCapitalize="characters" spellCheck={false} className={styles.input} value={code} placeholder="XXXXX-XXXXX" onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldNew")}</span>
          <input type="password" dir="ltr" required minLength={10} autoComplete="new-password" className={styles.input} value={pw} onChange={(e) => setPw(e.target.value)} />
          <span className={auth.hint}>{t("auth.passwordHint")}</span>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldConfirm")}</span>
          <input type="password" dir="ltr" required autoComplete="new-password" className={styles.input} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error ? (
          <span role="alert" className={styles.loginError}>
            {t(error.key)}
            {error.detail ? <span dir="auto" className={auth.detail}> {error.detail}</span> : null}
          </span>
        ) : null}
        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? t("auth.resetBusy") : t("auth.resetSubmit")}
        </button>
      </form>
      <Link href="/" className={auth.back}>
        {t("auth.backToSignIn")}
      </Link>
    </AuthFrame>
  );
}

export default ResetForm;
