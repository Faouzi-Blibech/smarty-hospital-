"use client";

import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { ApiError, issuePatientResetCode } from "@/lib/api";
import type { OneTimeCode } from "@/lib/types";
import { CodeDialog } from "./CodeDialog";
import styles from "./AccessPanel.module.css";

/** Forgotten-password path: the admin or attending doctor issues a one-time reset code for the patient's account. */
export function PatientResetCode({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [resetIssued, setResetIssued] = useState<OneTimeCode | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

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
      <h3 className={styles.title}>{t("accounts.patientResetTitle")}</h3>
      <p className={styles.lead}>{t("accounts.patientResetLead")}</p>
      <div className={styles.row}>
        <button type="button" className={styles.btnPrimary} disabled={resetBusy} onClick={() => void issueReset()}>
          {resetBusy ? t("accounts.patientResetBusy") : t("accounts.patientResetCode")}
        </button>
      </div>
      {error ? (
        <span role="alert" className={styles.error}>
          {error}
        </span>
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

export default PatientResetCode;
