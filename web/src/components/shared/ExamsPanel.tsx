"use client";

// Exams for one patient: ordered and done, with the uploaded files and report lines. A person reads the
// results; Ward only stores and shows them.
import { examLabel, deptLabel } from "@/lib/labels";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { examFileUrl, getPatientExams } from "@/lib/api";
import { tunisDay, tunisTime } from "@/lib/time";
import type { ExamOrder } from "@/lib/types";
import styles from "./ExamsPanel.module.css";

export function ExamsPanel({ patientId }: { patientId: string }) {
  const { t, lang } = useT();
  const [rows, setRows] = useState<ExamOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPatientExams(patientId).then((r) => alive && setRows(r)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [patientId]);

  async function open(resultId: string) {
    if (opening) return;
    setOpenMsg(null);
    const w = window.open("", "_blank");
    if (!w) {
      setOpenMsg(t("shared.examsPopup"));
      return;
    }
    setOpening(resultId);
    try {
      const url = await examFileUrl(resultId);
      w.location.href = url;
      if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      w.close();
      setOpenMsg(t("shared.examsOpenFail"));
    } finally {
      setOpening(null);
    }
  }

  const shown = (rows ?? []).filter((e) => e.status === "ordered" || e.status === "done");
  return (
    <section className={styles.card} aria-label={t("shared.examsTitle")}>
      <h3 className={styles.h3}>{t("shared.examsTitle")}</h3>
      {failed ? <p className={styles.note}>{t("shared.examsLoadFail")}</p> : null}
      {openMsg ? <p className={styles.note} role="alert">{openMsg}</p> : null}
      {!rows && !failed ? <span className="ward-skeleton" style={{ height: 60, width: "100%" }} /> : null}
      {rows && !shown.length ? <p className={styles.note}>{t("shared.examsNone")}</p> : null}
      {shown.map((e) => (
        <div key={e.id} className={styles.row}>
          <div className={styles.line}>
            <b>{examLabel(e, t)}</b>
            <span className={styles.dept}>{deptLabel(e.department, t)}</span>
            <span className={e.status === "done" ? styles.done : styles.waiting}>
              {e.status === "done"
                ? e.done_at
                  ? t("shared.examResultInAt", { when: `${tunisDay(e.done_at, lang)} ${tunisTime(e.done_at)}` })
                  : t("shared.examResultIn")
                : t("shared.examWaiting")}
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
