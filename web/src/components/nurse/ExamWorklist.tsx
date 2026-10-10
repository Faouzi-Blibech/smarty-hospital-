"use client";

// Department worklist: exams ordered for this department, waiting for a result. The nurse attaches the file
// (PDF, JPEG or PNG, at most 15 MB) and a short report line; the ordering doctor then sees it.
import { examLabel } from "@/lib/labels";
import { useCallback, useEffect, useState } from "react";
import { Toast, useToast } from "@/components/Toast";
import { useT } from "@/i18n/I18nProvider";
import { ApiError, getExamWorklist, uploadExamResult } from "@/lib/api";
import { tunisTime } from "@/lib/time";
import type { ExamOrder } from "@/lib/types";
import styles from "./ExamWorklist.module.css";

const MAX = 15 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png"];

function Row({ exam, onDone }: { exam: ExamOrder; onDone: (id: string) => void }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!file) return;
    if (!TYPES.includes(file.type) || file.size > MAX) {
      setError(t("nurse.examBadFile"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadExamResult(exam.id, file, report.trim());
      onDone(exam.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.code === "bad_file") setError(t("nurse.examBadFile"));
      else if (e instanceof ApiError && e.status === 403) setError(t("nurse.examOtherDept"));
      else setError(t("nurse.examUploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.who}>
        <b dir="auto">{exam.patient_name}</b>
        <span>{examLabel(exam, t)}</span>
        <span className={styles.meta}>{t("nurse.examOrdered", { time: exam.ordered_at ? tunisTime(exam.ordered_at) : "—" })}</span>
      </div>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={t("nurse.examResultFor", { label: examLabel(exam, t) })} />
      <input className={styles.report} placeholder={t("nurse.examReportPlaceholder")} value={report} maxLength={2000} onChange={(e) => setReport(e.target.value)} />
      <button className={styles.send} disabled={!file || busy} onClick={() => void send()}>{busy ? t("nurse.examUploading") : t("nurse.examUpload")}</button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}

export function ExamWorklist() {
  const { t } = useT();
  const [rows, setRows] = useState<ExamOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [toast, showToast] = useToast<string>();

  const load = useCallback(() => {
    setFailed(false);
    getExamWorklist().then(setRows).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>{t("nurse.examTitle")}</h1>
      <p className={styles.sub}>{t("nurse.examSub")}</p>
      {failed ? <p className={styles.error}>{t("nurse.examLoadFailed")} <button onClick={load}>{t("nurse.examRetry")}</button></p> : null}
      {!rows && !failed ? <span className="ward-skeleton" style={{ height: 80, width: "100%" }} /> : null}
      {rows && !rows.length ? <p className={styles.sub}>{t("nurse.examNothing")}</p> : null}
      {rows?.map((e) => (
        <Row key={e.id} exam={e} onDone={(id) => { setRows((r) => r?.filter((x) => x.id !== id) ?? r); showToast(t("nurse.examUploaded")); }} />
      ))}
      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}
