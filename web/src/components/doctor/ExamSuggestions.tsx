"use client";

// Suggested exams for one request: the doctor ticks what to keep and orders them before the visit.
// The suggestions come from rules; nothing is ordered until a doctor clicks "Order selected".
import { examLabel, deptLabel } from "@/lib/labels";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { Key } from "@/i18n/messages";
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
  const { t } = useT();
  const [rows, setRows] = useState<ExamOrder[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  const load = useCallback(() => {
    let alive = true;
    setError(null);
    getAppointmentExams(appointmentId)
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setError(null);
        setPicked(new Set(r.filter((e) => e.status === "suggested").map((e) => e.id)));
      })
      .catch(() => alive && setError("doctor.examsLoadError"));
    getExamCatalogue().then((c) => alive && setCatalogue(c)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [appointmentId]);

  useEffect(() => load(), [load]);

  if (error && !rows) {
    return (
      <p className={styles.error}>
        {t(error)} <button onClick={() => void load()}>{t("doctor.retry")}</button>
      </p>
    );
  }
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
      setError("doctor.examsOrderError");
    } finally {
      setBusy(false);
    }
  }

  async function addOne() {
    if (!extra) return;
    setBusy(true);
    setError(null);
    try {
      const row = await addExam({ patient_id: patientId, appointment_id: appointmentId, code: extra }, { by: actorId });
      const next = [...(rows ?? []), row];
      setRows(next);
      setExtra("");
      onChanged?.(next);
    } catch {
      setError("doctor.examsAddError");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.box}>
      {suggested.length ? (
        <>
          <span className={styles.title}>{t("doctor.examsSuggestedTitle")}</span>
          {suggested.map((e) => (
            <label key={e.id} className={styles.item}>
              <input
                type="checkbox"
                checked={picked.has(e.id)}
                onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
              />
              {examLabel(e, t)} <span className={styles.dept}>{deptLabel(e.department, t)}</span>
            </label>
          ))}
          <span className={styles.status}>{t("doctor.examsUnticked")}</span>
          <button className={styles.order} disabled={busy} onClick={() => void submit()}>
            {picked.size ? t("doctor.orderSelected", { n: picked.size }) : t("doctor.dropAll")}
          </button>
        </>
      ) : null}
      {active.length ? (
        <span className={styles.status}>
          {t("doctor.examsProgress", { done: active.filter((e) => e.status === "done").length, total: active.length })} ·{" "}
          {active.map((e) => examLabel(e, t)).join(", ")}
        </span>
      ) : null}
      {!suggested.length ? (
        <span className={styles.add}>
          <select value={extra} onChange={(ev) => setExtra(ev.target.value)} aria-label={t("doctor.addAnExam")}>
            <option value="">{t("doctor.addAnExamOption")}</option>
            {catalogue.map((c) => <option key={c.code} value={c.code}>{examLabel(c, t)} · {deptLabel(c.department, t)}</option>)}
          </select>
          <button disabled={!extra || busy} onClick={() => void addOne()}>{t("doctor.add")}</button>
        </span>
      ) : null}
      {error ? <p className={styles.error} role="alert">{t(error)}</p> : null}
    </div>
  );
}
