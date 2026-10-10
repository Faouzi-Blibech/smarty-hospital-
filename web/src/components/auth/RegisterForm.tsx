"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useT } from "@/i18n/I18nProvider";
import { describeError, normalizeCode, looksLikeEmail, PASSWORD_ERROR_KEYS, passwordProblem, type ErrorInfo } from "@/lib/accountsUi";
import { getDoctorDirectory, registerAccount } from "@/lib/api";
import type { DoctorRef } from "@/lib/types";
import { AuthFrame } from "./AuthFrame";
import auth from "./Auth.module.css";
import styles from "@/app/page.module.css";

export function RegisterForm() {
  const { t } = useT();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", note: "", doctor: "", code: "" });
  const [doctors, setDoctors] = useState<DoctorRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    let alive = true;
    // The picker is optional: if the directory fails the form still works without it.
    getDoctorDirectory().then((d) => alive && setDoctors(d), () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!f.name.trim() || !f.email.trim() || !f.password || !f.confirm) {
      setError({ key: "auth.errRequired", detail: null });
      return;
    }
    if (!looksLikeEmail(f.email)) {
      setError({ key: "auth.errEmail", detail: null });
      return;
    }
    const problem = passwordProblem(f.password, f.confirm, f.email.trim(), f.name.trim());
    if (problem) {
      setError({ key: PASSWORD_ERROR_KEYS[problem], detail: null });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerAccount({
        name: f.name.trim(),
        email: f.email.trim(),
        password: f.password,
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
        ...(f.doctor ? { requested_doctor_id: f.doctor } : {}),
        ...(f.code.trim() ? { enrollment_code: normalizeCode(f.code) } : {}),
      });
      setF((s) => ({ ...s, password: "", confirm: "" }));
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <AuthFrame title={t("auth.registerTitle")}>
        <div className={auth.done} role="status">
          <h2 className={auth.doneTitle}>{t("auth.registerDoneTitle")}</h2>
          <p className={auth.doneBody}>{t("auth.registerDoneBody")}</p>
          <p className={auth.doneBody}>{t("auth.registerDoneNext")}</p>
          <Link href="/" className={auth.back}>
            {t("auth.backToSignIn")}
          </Link>
        </div>
      </AuthFrame>
    );

  return (
    <AuthFrame title={t("auth.registerTitle")} lead={t("auth.registerLead")}>
      <form className={styles.login} noValidate onSubmit={submit} aria-label={t("auth.registerTitle")}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldName")}</span>
          <input dir="auto" required autoComplete="name" className={styles.input} value={f.name} onChange={(e) => set("name")(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldEmail")}</span>
          <input type="email" dir="ltr" required autoComplete="username" className={styles.input} value={f.email} onChange={(e) => set("email")(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldPassword")}</span>
          <input type="password" dir="ltr" required minLength={10} autoComplete="new-password" className={styles.input} value={f.password} onChange={(e) => set("password")(e.target.value)} />
          <span className={auth.hint}>{t("auth.passwordHint")}</span>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldConfirm")}</span>
          <input type="password" dir="ltr" required autoComplete="new-password" className={styles.input} value={f.confirm} onChange={(e) => set("confirm")(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldNote")}</span>
          <input dir="auto" className={styles.input} value={f.note} placeholder={t("auth.fieldNoteHint")} onChange={(e) => set("note")(e.target.value)} />
        </label>
        {doctors.length ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("auth.fieldDoctor")}</span>
            <select className={auth.select} value={f.doctor} onChange={(e) => set("doctor")(e.target.value)}>
              <option value="">{t("auth.doctorNone")}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("auth.fieldEnrollCode")}</span>
          <input dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} className={styles.input} value={f.code} placeholder="XXXXX-XXXXX" onChange={(e) => set("code")(e.target.value)} />
          <span className={auth.hint}>{t("auth.fieldEnrollHint")}</span>
        </label>
        {error ? (
          <span role="alert" className={styles.loginError}>
            {t(error.key)}
            {error.detail ? <span dir="auto" className={auth.detail}> {error.detail}</span> : null}
          </span>
        ) : null}
        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? t("auth.registerBusy") : t("auth.registerSubmit")}
        </button>
      </form>
      <Link href="/" className={auth.back}>
        {t("auth.backToSignIn")}
      </Link>
    </AuthFrame>
  );
}

export default RegisterForm;
