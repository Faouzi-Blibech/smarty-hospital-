"use client";

// Admin / Beds & devices (/admin/devices): bedside units, discharge and assign.
// Assign → POST /devices/{id}/assign, Discharge → POST /admissions/{id}/discharge (api.md 1.4).
// In mock mode, discharging an offline unit shows the "Couldn’t reach" result from Admin / States.
import { useCallback, useEffect, useRef, useState } from "react";
import { Toast, useToast } from "@/components/Toast";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { assignDevice, dischargeAdmission, getDevices } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { ago, now, tunisTime, USE_MOCKS } from "@/lib/time";
import type { Device } from "@/lib/types";
import { MOCK_WARD, usePatientWards, wardsOf } from "./wards";
import page from "./AdminPage.module.css";
import styles from "./DevicesView.module.css";

const LATEST_FW = "v0.4.2";
/** The admitted patient waiting for a bed (design sample; no admissions endpoint yet). */
const NEW_PATIENT = { id: "p-0008", name: "Karim Ben Ali", label: "Karim Ben Ali · admitted 09:40" };

function lastSeen(d: Device): string {
  if (d.online) return ago(d.last_seen);
  const min = Math.max(0, Math.round((now().getTime() - Date.parse(d.last_seen)) / 60_000));
  return `${tunisTime(d.last_seen)} (${min} min)`;
}

export function DevicesView() {
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
  const ward = wardsOf(list.map((d) => d.patient_id), patientWards);
  const bedWard = (d: Device) => wardsOf([d.patient_id], patientWards);

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
      showToast(`${d.id}: Couldn’t discharge — no admission found for this unit. Reload the page and try again.`);
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
      showToast(`${d.id}: Device cleared. Follow-up request created automatically for ${p?.name ?? "the patient"}.`);
    } catch {
      showToast(`${d.id}: Couldn’t discharge. Nothing was changed — try again.`);
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
      showToast(`${id} assigned to ${NEW_PATIENT.name} · Bed ${assignBed}. Schedule sent to the unit.`);
    } catch {
      showToast(`Couldn’t assign ${id}. Nothing was changed — try again.`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className={page.page}>
      <div className={page.head}>
        <div className={page.titles}>
          <h2 className={page.h2}>Beds &amp; devices</h2>
          <span className={page.sub}>
            {ward ? `${ward} · ` : ""}
            {state === "loading" ? "…" : online} of {state === "loading" ? 8 : list.length} bedside units online
          </span>
        </div>
      </div>

      {unreachable ? (
        <div role="alert" className={styles.unreachable}>
          <span>
            <b>Couldn’t reach {unreachable}.</b> The unit will clear when it reconnects.{" "}
            <button type="button" className={styles.retry} onClick={retry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </span>
        </div>
      ) : null}

      {state === "error" ? (
        <ErrorCard title="Couldn’t load the bedside units." onRetry={load} />
      ) : (
        <div className={`${styles.table} ${page.scrollX}`}>
          <div className={`${styles.grid} ${page.th}`}>
            <span>Unit</span>
            <span>Status</span>
            <span>Firmware</span>
            <span>Last seen</span>
            <span>Assigned to</span>
            <span>Actions</span>
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
                      {d.online ? "Online" : "Offline"}
                    </span>
                    <span className={styles.stack}>
                      <span className={styles.fw}>{d.fw_version}</span>
                      {d.fw_version !== LATEST_FW ? <span className={styles.update}>Update available</span> : null}
                    </span>
                    <span className={styles.seen}>{lastSeen(d)}</span>
                    <span className={styles.stack}>
                      <span dir="auto" className={styles.patient} style={{ color: p ? "var(--ink)" : "var(--muted)" }}>
                        {p ? p.name : "Unassigned"}
                      </span>
                      <span className={styles.bed}>{p ? [`Bed ${p.bed}`, bedWard(d)].filter(Boolean).join(" · ") : "Idle"}</span>
                    </span>
                    <div className={styles.actions}>
                      {p ? (
                        <button type="button" className={styles.btn} disabled={working === d.id} onClick={() => void discharge(d)}>
                          Discharge
                        </button>
                      ) : (
                        <button type="button" className={styles.btnPrimary} onClick={() => setAssignId(d.id)}>
                          Assign to patient + bed
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
              Assign {assignId}
            </span>
            <label className={page.field}>
              <span className={page.fieldLabel}>Patient</span>
              <span className={page.selectWrap}>
                <select ref={firstField} className={page.select} defaultValue={NEW_PATIENT.name}>
                  <option value={NEW_PATIENT.name}>{NEW_PATIENT.label}</option>
                </select>
              </span>
            </label>
            <label className={page.field}>
              <span className={page.fieldLabel}>Bed</span>
              <span className={page.selectWrap}>
                <select className={page.select} defaultValue={assignBed}>
                  <option value={assignBed}>{USE_MOCKS ? `${assignBed} · ${MOCK_WARD}` : assignBed}</option>
                </select>
              </span>
            </label>
            <span className={page.help}>The unit will show the patient’s schedule within a minute.</span>
            <div className={styles.dialogActions}>
              <button type="button" className={page.btn} onClick={() => setAssignId(null)}>
                Cancel
              </button>
              <button type="button" className={page.btnPrimary} disabled={!!working} onClick={() => void doAssign()}>
                Assign
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
