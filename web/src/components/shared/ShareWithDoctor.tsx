"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast, useToast } from "@/components/Toast";
import { useT } from "@/i18n/I18nProvider";
import { fmtWhen } from "@/lib/accountsUi";
import { getDoctorDirectory, getPatientAccess, grantPatientAccess, revokePatientAccess } from "@/lib/api";
import { now } from "@/lib/time";
import type { DoctorRef, PatientAccessGrant } from "@/lib/types";
import styles from "./AccessPanel.module.css";

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function ShareWithDoctor({ patientId, excludeIds }: { patientId: string; excludeIds: string[] }) {
  const { t, lang } = useT();
  const [grants, setGrants] = useState<PatientAccessGrant[] | null>(null);
  const [directory, setDirectory] = useState<DoctorRef[]>([]);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast<string>(5000);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getPatientAccess(patientId), getDoctorDirectory()]).then(
      ([g, d]) => {
        setGrants(g);
        setDirectory(d);
      },
      () => setFailed(true),
    );
  }, [patientId]);
  useEffect(load, [load]);

  const choices = directory.filter((d) => !excludeIds.includes(d.id) && !(grants ?? []).some((g) => g.doctor_id === d.id));

  async function add() {
    if (!pick || busy) return;
    setBusy(true);
    try {
      // The date input is a local calendar day: share until the end of that day.
      // The server caps sharing at 1 year, so clamp the last selectable day just inside it.
      const cap = now().getTime() + 365 * DAY_MS - 60_000;
      const expires_at = until ? new Date(Math.min(new Date(`${until}T23:59:59`).getTime(), cap)).toISOString() : undefined;
      const g = await grantPatientAccess(patientId, { doctor_id: pick, ...(expires_at ? { expires_at } : {}) });
      setGrants((list) => [...(list ?? []).filter((x) => x.doctor_id !== g.doctor_id), g]);
      setPick("");
      setUntil("");
      showToast(t("accounts.shareAdded", { name: g.doctor_name }));
    } catch {
      showToast(t("accounts.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(g: PatientAccessGrant) {
    setBusy(true);
    try {
      await revokePatientAccess(patientId, g.doctor_id);
      setGrants((list) => (list ?? []).filter((x) => x.doctor_id !== g.doctor_id));
      showToast(t("accounts.shareRevoked", { name: g.doctor_name }));
    } catch {
      showToast(t("accounts.actionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.title}>{t("accounts.shareTitle")}</h3>
      <p className={styles.lead}>{t("accounts.shareLead")}</p>
      {failed ? (
        <span role="alert" className={styles.error}>
          {t("accounts.shareLoadError")}
        </span>
      ) : grants && grants.length === 0 ? (
        <p className={styles.lead}>{t("accounts.shareEmpty")}</p>
      ) : (
        (grants ?? []).map((g) => (
          <div key={g.doctor_id} className={styles.grant}>
            <span dir="auto" className={`${styles.grow} ${styles.title}`}>
              {g.doctor_name}
            </span>
            <span className={styles.lead}>{t("accounts.shareUntil", { when: fmtWhen(g.expires_at, lang) })}</span>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void revoke(g)}>
              {t("accounts.shareRevoke")}
            </button>
          </div>
        ))
      )}
      <div className={styles.row}>
        <select aria-label={t("accounts.sharePick")} className={`${styles.input} ${styles.grow}`} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{t("accounts.sharePick")}</option>
          {choices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label className={styles.row}>
          <span className={styles.lead}>{t("accounts.shareExpiry")}</span>
          <input
            type="date"
            className={styles.input}
            value={until}
            min={isoDay(now().getTime() + DAY_MS)}
            max={isoDay(now().getTime() + 365 * DAY_MS)}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <button type="button" className={styles.btnPrimary} disabled={!pick || busy} onClick={() => void add()}>
          {t("accounts.shareAdd")}
        </button>
      </div>
      <span className={styles.lead}>{t("accounts.shareExpiryHint")}</span>
      {toast ? <Toast>{toast}</Toast> : null}
    </section>
  );
}

export default ShareWithDoctor;
