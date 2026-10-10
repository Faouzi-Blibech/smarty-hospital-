"use client";

import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { ApiError, issueEnrollmentCode, issuePatientResetCode } from "@/lib/api";
import type { OneTimeCode } from "@/lib/types";
import { CodeDialog } from "./CodeDialog";
import styles from "./AccessPanel.module.css";

export function EnrollmentCode({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<OneTimeCode | null>(null);
  const [resetIssued, setResetIssued] = useState<OneTimeCode | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  async function issue() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setIssued(await issueEnrollmentCode(patientId));
    } catch (err) {
      setError(t(err instanceof ApiError && err.code === "already_enrolled" ? "accounts.enrollAlready" : "accounts.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function issueReset() {
    if (resetBusy) return;
    setResetBusy(true);
    setError(null);
    try {
      setResetIssued(await issuePatientResetCode(patientId));
    } catch (err) {
      setError(t(err instanceof ApiError && err.status === 404 ? "accounts.patientResetNoAccount" : "accounts.actionError"));
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.title}>{t("accounts.enrollTitle")}</h3>
      <p className={styles.lead}>{t("accounts.enrollLead")}</p>
      <div className={styles.row}>
        <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void issue()}>
          {busy ? t("accounts.enrollBusy") : t("accounts.enrollIssue")}
        </button>
        <button type="button" className={styles.btn} disabled={resetBusy} onClick={() => void issueReset()}>
          {resetBusy ? t("accounts.patientResetBusy") : t("accounts.patientResetCode")}
        </button>
      </div>
      {error ? (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      ) : null}
      {issued ? (
        <CodeDialog subject={t("accounts.enrollSubject", { name: patientName })} code={issued.code} expiresAt={issued.expires_at} onClose={() => setIssued(null)} />
      ) : null}
      {resetIssued ? (
        <CodeDialog
          subject={t("accounts.patientResetSubject", { name: patientName })}
          code={resetIssued.code}
          expiresAt={resetIssued.expires_at}
          onClose={() => setResetIssued(null)}
        />
      ) : null}
    </section>
  );
}

export default EnrollmentCode;
