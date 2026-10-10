"use client";

// Admin / Beds & devices (/admin/devices): bedside units, discharge and assign.
// Assign → POST /devices/{id}/assign, Discharge → POST /admissions/{id}/discharge (api.md 1.4).
// In mock mode, discharging an offline unit shows the "Couldn’t reach" result from Admin / States.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { Lang } from "@/i18n/config";
import type { TFn } from "@/i18n/messages";
import { Toast, useToast } from "@/components/Toast";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { assignDevice, dischargeAdmission, getDevices } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { ago, now, tunisTime, USE_MOCKS } from "@/lib/time";
import type { Device } from "@/lib/types";
import { usePatientWards, wardsOf } from "./wards";
import page from "./AdminPage.module.css";
import styles from "./DevicesView.module.css";

const LATEST_FW = "v0.4.2";
/** The admitted patient waiting for a bed (design sample; no admissions endpoint yet). */
const NEW_PATIENT = { id: "p-0008", name: "Karim Ben Ali", admittedAt: "09:40" };

function lastSeen(d: Device, t: TFn, lang: Lang): string {
  if (d.online) return ago(d.last_seen, now(), lang);
  const min = Math.max(0, Math.round((now().getTime() - Date.parse(d.last_seen)) / 60_000));
  return t("admin.devSeenOffline", { time: tunisTime(d.last_seen), n: min });
}

export function DevicesView() {
  const { t, lang } = useT();
  const flags = useDemoFlags();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [discharged, setDischarged] = useState<Record<string, boolean>>({});
  const [assigned, setAssigned] = useState<Record<string, { name: string; bed: string }>>({});
  const [assignId, setAssignId] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [toast, showToast] = useToast<string>(5000);
  const firstField = useRef<HTMLSelectElement>(null);

  const load = useCallback(() => {
    setFailed(false);
    setDevices(null);
    getDevices()
      .then(setDevices)
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!assignId) return;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAssignId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assignId]);

  const state = flags.state === "empty" ? null : (flags.state ?? (failed ? "error" : devices == null ? "loading" : null));
  const list = devices ?? [];
  const online = list.filter((d) => d.online).length;
  const patientWards = usePatientWards();
  const ward = wardsOf(list.map((d) => d.patient_id), patientWards, t);
  const bedWard = (d: Device) => wardsOf([d.patient_id], patientWards, t);

  const patientOf = (d: Device) => assigned[d.id] ?? (discharged[d.id] ? null : d.patient_name ? { name: d.patient_name, bed: d.bed ?? "" } : d.patient_id ? { name: d.patient_id, bed: d.bed ?? "" } : null);

  const discharge = async (d: Device) => {
    const p = patientOf(d);
    if (USE_MOCKS && !d.online) {
      setUnreachable(d.id);
      return;
    }
    // A unit assigned on this screen has no admission id until the list reloads.
    const admissionId = assigned[d.id] ? null : d.admission_id;
    if (!admissionId && !USE_MOCKS) {
      showToast(t("admin.devNoAdmission", { id: d.id }));
      return;
    }
    setUnreachable(null);
    setWorking(d.id);
    try {
      if (admissionId) await dischargeAdmission(admissionId); // mock: a unit assigned here clears locally
      setDischarged((s) => ({ ...s, [d.id]: true }));
      setAssigned((s) => {
        const next = { ...s };
        delete next[d.id];
        return next;
      });
      showToast(t("admin.devCleared", { id: d.id, name: p?.name ?? t("admin.devThePatient") }));
    } catch {
      showToast(t("admin.devDischargeFail", { id: d.id }));
    } finally {
      setWorking(null);
    }
  };

  const retry = () => {
    const d = list.find((x) => x.id === unreachable);
    setRetrying(true);
    setTimeout(() => {
      setRetrying(false);
      if (d) void discharge(d);
    }, 600);
  };

  const assignTarget = list.find((d) => d.id === assignId) ?? null;
  const assignBed = assignTarget?.bed ?? "C-13";
  const doAssign = async () => {
    if (!assignId || working) return;
    const id = assignId;
    setWorking(id);
    try {
      await assignDevice(id, { patient_id: NEW_PATIENT.id, bed: assignBed });
      setAssigned((s) => ({ ...s, [id]: { name: NEW_PATIENT.name, bed: assignBed } }));
      setDischarged((s) => ({ ...s, [id]: false }));
      setAssignId(null);
      showToast(t("admin.devAssigned", { id, name: NEW_PATIENT.name, bed: assignBed }));
    } catch {
      showToast(t("admin.devAssignFail", { id }));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className={page.page}>
      <div className={page.head}>
        <div className={page.titles}>
          <h2 className={page.h2}>{t("admin.bedsDevices")}</h2>
          <span className={page.sub}>
            {ward ? `${ward} · ` : ""}
            {t("admin.devSub", { online: state === "loading" ? "…" : online, total: state === "loading" ? 8 : list.length })}
          </span>
        </div>
      </div>

      {unreachable ? (
        <div role="alert" className={styles.unreachable}>
          <span>
            <b>{t("admin.devUnreachable", { id: unreachable })}</b> {t("admin.devUnreachableBody")}{" "}
            <button type="button" className={styles.retry} onClick={retry} disabled={retrying}>
              {retrying ? t("admin.devRetrying") : t("admin.retry")}
            </button>
          </span>
        </div>
      ) : null}

      {state === "error" ? (
        <ErrorCard title={t("admin.devLoadError")} onRetry={load} />
      ) : (
        <div className={`${styles.table} ${page.scrollX}`}>
          <div className={`${styles.grid} ${page.th}`}>
            <span>{t("admin.devColUnit")}</span>
            <span>{t("admin.devColStatus")}</span>
            <span>{t("admin.devColFirmware")}</span>
            <span>{t("admin.devColSeen")}</span>
            <span>{t("admin.devColAssigned")}</span>
            <span>{t("admin.devColActions")}</span>
          </div>
          {state === "loading"
            ? [1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
                <div key={k} className={`${styles.grid} ${page.skelRow}`} aria-busy="true">
                  <span className="ward-skeleton" style={{ height: 14, width: 70 }} />
                  <span className="ward-skeleton" style={{ height: 14, width: 80 }} />
                  <span className="ward-skeleton" style={{ height: 14, width: 60 }} />
                  <span className="ward-skeleton" style={{ height: 14, width: 70 }} />
                  <span className="ward-skeleton" style={{ height: 14, width: "50%" }} />
                  <span />
                </div>
              ))
            : list.map((d) => {
                const p = patientOf(d);
                return (
                  <div key={d.id} className={`${styles.grid} ${page.tr}`}>
                    <span className={styles.unit}>{d.id}</span>
                    <span className={styles.status} style={{ color: d.online ? "var(--news-normal-fg)" : "var(--news-high-fg)" }}>
                      <span
                        className={styles.dot}
                        style={{
                          background: d.online ? "var(--teal)" : "transparent",
                          borderColor: d.online ? "var(--teal)" : "var(--news-high-fg)",
                        }}
                      />
                      {d.online ? t("admin.devOnline") : t("admin.devOffline")}
                    </span>
                    <span className={styles.stack}>
                      <span className={styles.fw}>{d.fw_version}</span>
                      {d.fw_version !== LATEST_FW ? <span className={styles.update}>{t("admin.devUpdate")}</span> : null}
                    </span>
                    <span className={styles.seen}>{lastSeen(d, t, lang)}</span>
                    <span className={styles.stack}>
                      <span dir="auto" className={styles.patient} style={{ color: p ? "var(--ink)" : "var(--muted)" }}>
                        {p ? p.name : t("admin.devUnassigned")}
                      </span>
                      <span className={styles.bed}>{p ? [t("admin.bedN", { bed: p.bed }), bedWard(d)].filter(Boolean).join(" · ") : t("admin.devIdle")}</span>
                    </span>
                    <div className={styles.actions}>
                      {p ? (
                        <button type="button" className={styles.btn} disabled={working === d.id} onClick={() => void discharge(d)}>
                          {t("admin.devDischarge")}
                        </button>
                      ) : (
                        <button type="button" className={styles.btnPrimary} onClick={() => setAssignId(d.id)}>
                          {t("admin.devAssignBtn")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
        </div>
      )}

      {assignId ? (
        <div className={styles.scrim} onClick={(e) => e.target === e.currentTarget && setAssignId(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="assign-title" className={styles.dialog}>
            <span id="assign-title" className={styles.dialogTitle}>
              {t("admin.devAssignTitle", { id: assignId })}
            </span>
            <label className={page.field}>
              <span className={page.fieldLabel}>{t("admin.patient")}</span>
              <span className={page.selectWrap}>
                <select ref={firstField} className={page.select} defaultValue={NEW_PATIENT.name}>
                  <option value={NEW_PATIENT.name}>{t("admin.devAdmittedAt", { name: NEW_PATIENT.name, time: NEW_PATIENT.admittedAt })}</option>
                </select>
              </span>
            </label>
            <label className={page.field}>
              <span className={page.fieldLabel}>{t("admin.bed")}</span>
              <span className={page.selectWrap}>
                <select className={page.select} defaultValue={assignBed}>
                  <option value={assignBed}>{USE_MOCKS ? `${assignBed} · ${t("admin.wardC")}` : assignBed}</option>
                </select>
              </span>
            </label>
            <span className={page.help}>{t("admin.devAssignHelp")}</span>
            <div className={styles.dialogActions}>
              <button type="button" className={page.btn} onClick={() => setAssignId(null)}>
                {t("admin.cancel")}
              </button>
              <button type="button" className={page.btnPrimary} disabled={!!working} onClick={() => void doAssign()}>
                {t("admin.devAssign")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}

export default DevicesView;
