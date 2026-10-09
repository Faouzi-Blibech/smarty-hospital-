"use client";

// Suggested exams for one request: the doctor ticks what to keep and orders them before the visit.
// The suggestions come from rules; nothing is ordered until a doctor clicks "Order selected".
import { useEffect, useState } from "react";
import { addExam, getAppointmentExams, getExamCatalogue, orderExams } from "@/lib/api";
import type { CatalogueItem, ExamOrder } from "@/lib/types";
import styles from "./ExamSuggestions.module.css";

export interface ExamSuggestionsProps {
  appointmentId: string;
  patientId: string;
  actorId: string;
  onChanged?: (rows: ExamOrder[]) => void;
}

export function ExamSuggestions({ appointmentId, patientId, actorId, onChanged }: ExamSuggestionsProps) {
  const [rows, setRows] = useState<ExamOrder[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAppointmentExams(appointmentId)
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setPicked(new Set(r.filter((e) => e.status === "suggested").map((e) => e.id)));
      })
      .catch(() => alive && setError("Couldn’t load the suggested exams."));
    getExamCatalogue().then((c) => alive && setCatalogue(c)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [appointmentId]);

  if (error && !rows) return <p className={styles.error}>{error}</p>;
  if (!rows) return <span className="ward-skeleton" style={{ height: 18, width: 220 }} />;
  const suggested = rows.filter((e) => e.status === "suggested");
  const active = rows.filter((e) => e.status === "ordered" || e.status === "done");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const next = await orderExams(appointmentId, [...picked], { by: actorId });
      setRows(next);
      onChanged?.(next);
    } catch {
      setError("Couldn’t order the exams. Nothing was changed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addOne() {
    if (!extra) return;
    setBusy(true);
    try {
      const row = await addExam({ patient_id: patientId, appointment_id: appointmentId, code: extra }, { by: actorId });
      const next = [...rows!, row];
      setRows(next);
      setExtra("");
      onChanged?.(next);
    } catch {
      setError("Couldn’t add that exam.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.box}>
      {suggested.length ? (
        <>
          <span className={styles.title}>Suggested exams before the visit · rules, needs your review</span>
          {suggested.map((e) => (
            <label key={e.id} className={styles.item}>
              <input
                type="checkbox"
                checked={picked.has(e.id)}
                onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
              />
              {e.label} <span className={styles.dept}>{e.department}</span>
            </label>
          ))}
          <button className={styles.order} disabled={busy} onClick={() => void submit()}>
            {picked.size ? `Order selected (${picked.size})` : "Order none"}
          </button>
        </>
      ) : null}
      {active.length ? (
        <span className={styles.status}>
          Exams: {active.filter((e) => e.status === "done").length}/{active.length} results in ·{" "}
          {active.map((e) => e.label).join(", ")}
        </span>
      ) : null}
      {!suggested.length ? (
        <span className={styles.add}>
          <select value={extra} onChange={(ev) => setExtra(ev.target.value)} aria-label="Add an exam">
            <option value="">Add an exam…</option>
            {catalogue.map((c) => <option key={c.code} value={c.code}>{c.label} · {c.department}</option>)}
          </select>
          <button disabled={!extra || busy} onClick={() => void addOne()}>Add</button>
        </span>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
