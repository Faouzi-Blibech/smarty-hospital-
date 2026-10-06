"use client";

// Prescriptions card: active list, then the "New prescription" form (time chips, pill
// slots, allergy rule check) and the save toast.
import { useMemo, useState, type ReactNode } from "react";
import { Toast, useToast } from "@/components/Toast";
import { createPrescription } from "@/lib/api";
import { daysSince, now, tunisTime } from "@/lib/time";
import type { Patient, Prescription } from "@/lib/types";
import styles from "./Prescriptions.module.css";

const TIME_CHIPS = ["06:00", "08:00", "12:00", "14:00", "18:00", "20:00", "22:00"];
const SLOTS = ["1", "2", "3", "4", "r"] as const;
type SlotKey = (typeof SLOTS)[number];
/** Rule check (fixed rule, not AI): penicillin-family names. */
const PENICILLIN_FAMILY = /amox|penic|ampic|augment/i;
const DEFAULT_MED = "Furosemide 40mg";
const DEFAULT_PLAN = "Weigh every morning. Stop and call if weight drops more than 1 kg in a day.";

const drugName = (med: string) => med.split(" ")[0];

export interface PrescriptionsProps {
  patient: Patient;
  prescriptions: Prescription[];
  /** Doctor user id sent with the mutation (mock mode). */
  actorId: string;
  /** Called after a successful save so the page can refetch prescriptions and doses. */
  onSaved?: (rx: Prescription) => void;
}

export function Prescriptions({ patient, prescriptions, actorId, onSaved }: PrescriptionsProps) {
  const rows = useMemo(
    () => prescriptions.flatMap((rx) => rx.items.map((item, i) => ({ key: `${rx.id}-${i}`, rx, item }))),
    [prescriptions],
  );
  const slotMeds = useMemo(() => {
    const m: Partial<Record<SlotKey, string>> = {};
    for (const { item } of rows) if (item.slot != null) m[String(item.slot) as SlotKey] = drugName(item.med);
    return m;
  }, [rows]);
  const firstFree = (): SlotKey => SLOTS.find((k) => k !== "r" && !slotMeds[k]) ?? "r";

  const [med, setMed] = useState(DEFAULT_MED);
  const [days, setDays] = useState(5);
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [slot, setSlot] = useState<SlotKey | null>(null);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [saving, setSaving] = useState(false);
  const [toast, showToast] = useToast<{ tone: "ok" | "warn"; body: ReactNode }>(4500);

  const pickedSlot: SlotKey = slot && (slot === "r" || !slotMeds[slot]) ? slot : firstFree();
  const allergic = patient.allergies.some((a) => /penicillin/i.test(a));
  const allergyHit = allergic && PENICILLIN_FAMILY.test(med);
  const sortedTimes = [...times].sort();

  function reset() {
    setMed(DEFAULT_MED);
    setDays(5);
    setTimes(["08:00"]);
    setSlot(null);
    setPlan(DEFAULT_PLAN);
  }

  function firstDose(): string {
    if (!sortedTimes.length) return "not scheduled";
    const hm = tunisTime(now().toISOString());
    const today = sortedTimes.find((t) => t > hm);
    return today ? `today ${today}` : `tomorrow ${sortedTimes[0]}`;
  }

  async function save() {
    if (!med.trim() || saving) return;
    setSaving(true);
    const slotText = pickedSlot === "r" ? "reminder only" : `slot ${pickedSlot}`;
    const first = firstDose();
    try {
      const rx = await createPrescription(
        {
          patient_id: patient.id,
          items: [{ med: med.trim(), times: sortedTimes, slot: pickedSlot === "r" ? null : Number(pickedSlot), days }],
          care_plan: plan.trim(),
        },
        { by: actorId },
      );
      if (rx.published_to_device && patient.device_id) {
        showToast({
          tone: "ok",
          body: (
            <>
              <b>Sent to bedside unit</b> · {patient.device_id}, {slotText}. First dose {first}.
            </>
          ),
        });
      } else {
        showToast({
          tone: "warn",
          body: (
            <>
              <b>Saved · No device assigned.</b> Nurses will give doses from the med round.
            </>
          ),
        });
      }
      reset();
      onSaved?.(rx);
    } catch {
      showToast({
        tone: "warn",
        body: (
          <>
            <b>Couldn’t save the prescription.</b> Nothing was sent. Try again.
          </>
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  const sel = (on: boolean) => (on ? styles.on : "");
  const deviceLine = patient.device_id
    ? `bedside unit ${patient.device_id} has 4 pill slots`
    : "no bedside unit assigned";

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.h3}>Prescriptions</h3>
        <span className={styles.sub}>
          {rows.length} active · {deviceLine}
        </span>
      </div>
      <div className={`${styles.rxGrid} ${styles.th}`}>
        <span>Medicine</span>
        <span>Times</span>
        <span>Pill slot</span>
        <span>Days left</span>
        <span />
      </div>
      {rows.map(({ key, rx, item }) => {
        const left = Math.max(0, item.days - daysSince(rx.created_at));
        const override = !!rx.allergy_override;
        const by = rx.doctor_id === patient.attending_doctor_id ? patient.attending_doctor_name : null;
        const note = override ? `Allergy conflict flagged · override by ${by ?? rx.doctor_id}` : rx.care_plan;
        return (
          <div key={key} className={`${styles.rxGrid} ${styles.tr}`}>
            <div className={styles.medCell}>
              <span className={styles.med}>{item.med}</span>
              {note ? (
                <span className={styles.note} style={{ color: override ? "var(--danger)" : "var(--muted)" }}>
                  {note}
                </span>
              ) : null}
            </div>
            <div className={styles.times}>
              {item.times.map((t) => (
                <span key={t} className={styles.time}>
                  {t}
                </span>
              ))}
            </div>
            <div className={styles.slotCell}>
              <span className={styles.cells} aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={styles.cell} style={{ background: i === item.slot ? "var(--ink)" : "transparent" }} />
                ))}
              </span>
              <span className={styles.slotLabel}>{item.slot != null ? `Slot ${item.slot}` : "Reminder only"}</span>
            </div>
            <span className={styles.days}>{left}</span>
            <button type="button" className={styles.edit}>
              Edit
            </button>
          </div>
        );
      })}

      <div className={styles.form}>
        <span className={styles.formTitle}>New prescription</span>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Medicine and dose</span>
            <input
              value={med}
              onChange={(e) => setMed(e.target.value)}
              className={styles.input}
              style={{ borderColor: allergyHit ? "var(--danger)" : "var(--line-strong)" }}
              aria-invalid={allergyHit || undefined}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Number of days</span>
            <span className={styles.stepper}>
              <button type="button" onClick={() => setDays((d) => Math.max(1, d - 1))} aria-label="Fewer days" className={styles.step}>
                −
              </button>
              <span className={styles.stepValue}>{days}</span>
              <button type="button" onClick={() => setDays((d) => Math.min(90, d + 1))} aria-label="More days" className={styles.step}>
                +
              </button>
            </span>
          </label>
        </div>
        {allergyHit ? (
          <div role="alert" className={styles.rule}>
            <span className={styles.ruleDiamond} />
            <span>
              <b>Rule check: allergy conflict — High.</b> This medicine is in the penicillin family and the patient is allergic to
              penicillin. You can still save; the override will be logged.
            </span>
          </div>
        ) : null}
        <div className={styles.group}>
          <span className={styles.fieldLabel}>Times of day</span>
          <div className={styles.chips}>
            {TIME_CHIPS.map((t) => {
              const on = times.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTimes((s) => (on ? s.filter((x) => x !== t) : [...s, t]))}
                  className={`${styles.chip} ${sel(on)}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.group}>
          <span className={styles.fieldLabel}>Pill slot on bedside unit</span>
          <div className={styles.slots}>
            {SLOTS.map((k) => {
              const taken = k !== "r" && !!slotMeds[k];
              const on = pickedSlot === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={taken}
                  aria-pressed={on}
                  onClick={() => !taken && setSlot(k)}
                  className={`${styles.slot} ${taken ? styles.taken : sel(on)}`}
                >
                  <span className={styles.slotName}>{k === "r" ? "Reminder only" : `Slot ${k}`}</span>
                  <span className={styles.slotSub}>{k === "r" ? "No pill loaded" : taken ? `In use · ${slotMeds[k]}` : "Empty"}</span>
                </button>
              );
            })}
          </div>
        </div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Care plan note</span>
          <textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} dir="auto" className={styles.textarea} />
        </label>
        <div className={styles.formBar}>
          <span className={styles.formHint}>
            {patient.device_id
              ? `Saving sends the schedule to ${patient.device_id} and adds the doses to the nurse’s med round.`
              : "Saving adds the doses to the nurse’s med round."}
          </span>
          <button type="button" onClick={reset} className={styles.secondary}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className={styles.primary}>
            Save prescription
          </button>
        </div>
      </div>
      {toast ? (
        <Toast tone={toast.tone} className={styles.toast}>
          {toast.body}
        </Toast>
      ) : null}
    </section>
  );
}

export default Prescriptions;
