"use client";

import { useState, type FormEvent } from "react";
import { useT } from "@/i18n/I18nProvider";
import { describeError, PASSWORD_ERROR_KEYS, passwordProblem, type ErrorInfo } from "@/lib/accountsUi";
import { changePassword } from "@/lib/api";
import auth from "./Auth.module.css";
import styles from "@/app/page.module.css";

export function ChangePasswordForm() {
  const { t } = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setDone(false);
    if (!current || !next || !confirm) {
      setError({ key: "auth.errRequired", detail: null });
      return;
    }
    const problem = passwordProblem(next, confirm);
    if (problem) {
      setError({ key: PASSWORD_ERROR_KEYS[problem], detail: null });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(describeError(err, "password"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.login} noValidate onSubmit={submit} aria-label={t("auth.pwTitle")}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t("auth.pwCurrent")}</span>
        <input type="password" dir="ltr" required autoComplete="current-password" className={styles.input} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t("auth.fieldNew")}</span>
        <input type="password" dir="ltr" required minLength={10} autoComplete="new-password" className={styles.input} value={next} onChange={(e) => setNext(e.target.value)} />
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
      {done ? (
        <span role="status" className={auth.hint}>
          {t("auth.pwDone")}
        </span>
      ) : null}
      <button type="submit" className={styles.submit} disabled={busy}>
        {t("auth.pwSubmit")}
      </button>
    </form>
  );
}

export default ChangePasswordForm;
