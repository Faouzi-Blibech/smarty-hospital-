"use client";

// Exams for one patient: ordered and done, with the uploaded files and report lines. A person reads the
// results; Ward only stores and shows them.
import { useEffect, useState } from "react";
import { examFileUrl, getPatientExams } from "@/lib/api";
import { tunisDay, tunisTime } from "@/lib/time";
import type { ExamOrder } from "@/lib/types";
import styles from "./ExamsPanel.module.css";

export function ExamsPanel({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<ExamOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getPatientExams(patientId).then((r) => alive && setRows(r)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [patientId]);

  async function open(resultId: string) {
    setOpenFailed(false);
    const w = window.open("", "_blank");
    try {
      const url = await examFileUrl(resultId);
      if (w) w.location.href = url;
      if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      w?.close();
      setOpenFailed(true);
    }
  }

  const shown = (rows ?? []).filter((e) => e.status === "ordered" || e.status === "done");
  return (
    <section className={styles.card} aria-label="Exams">
      <h3 className={styles.h3}>Exams</h3>
      {failed ? <p className={styles.note}>Couldn’t load the exams.</p> : null}
      {openFailed ? <p className={styles.note} role="alert">Couldn’t open that file.</p> : null}
      {!rows && !failed ? <span className="ward-skeleton" style={{ height: 60, width: "100%" }} /> : null}
      {rows && !shown.length ? <p className={styles.note}>No exams ordered.</p> : null}
      {shown.map((e) => (
        <div key={e.id} className={styles.row}>
          <div className={styles.line}>
            <b>{e.label}</b>
            <span className={styles.dept}>{e.department}</span>
            <span className={e.status === "done" ? styles.done : styles.waiting}>
              {e.status === "done" ? `Result in · ${tunisDay(e.done_at!)} ${tunisTime(e.done_at!)}` : "Waiting for the result"}
            </span>
          </div>
          {(e.results ?? []).map((r) => (
            <div key={r.id} className={styles.result}>
              <button className={styles.file} onClick={() => void open(r.id)}>{r.file_name}</button>
              {r.report_text ? <span>“{r.report_text}”</span> : null}
              {r.uploaded_by_name ? <span className={styles.dept}>· {r.uploaded_by_name}</span> : null}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
