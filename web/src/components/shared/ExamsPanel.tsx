"use client";

// Exams for one patient: ordered and done, with the uploaded files and report lines. A person reads the
// results; Ward only stores and shows them. Radiographs carry an AI reading status; a doctor can open the
// reading, edit and sign the report, and add an outside X-ray.
import { examLabel, deptLabel } from "@/lib/labels";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { ApiError, examFileUrl, getPatientExams, getRadiographReading, uploadOutsideRadiograph } from "@/lib/api";
import { tunisDay, tunisTime } from "@/lib/time";
import type { ExamOrder, ExamResultFile, ReadingStatus, Role } from "@/lib/types";
import { RadiographReadingCard } from "./RadiographReadingCard";
import styles from "./ExamsPanel.module.css";

const POLL_MS = 4000;
const STATUS_KEY = {
  queued: "radiology.statusQueued",
  running: "radiology.statusRunning",
  ready: "radiology.statusReady",
  unavailable: "radiology.statusUnavailable",
  failed: "radiology.statusFailed",
} as const;
const isPending = (s: ReadingStatus) => s === "queued" || s === "running";

export function ExamsPanel({ patientId, role }: { patientId: string; role?: Role }) {
  const { t, lang } = useT();
  const [rows, setRows] = useState<ExamOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const isDoctor = role === "doctor";
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const r = await getPatientExams(patientId);
      if (alive.current) {
        setRows(r);
        setFailed(false);
      }
    } catch {
      if (alive.current) setFailed(true);
    }
  }, [patientId]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  // While a reading is queued/running, refresh the list so its chip moves by itself. A doctor also fetches the
  // reading itself (that is what advances the mock queue; on the real backend it returns the same status).
  const pendingIds = (rows ?? [])
    .flatMap((e) => e.results ?? [])
    .filter((r) => r.reading && isPending(r.reading.status))
    .map((r) => r.id)
    .join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const timer = setInterval(async () => {
      if (isDoctor) await Promise.allSettled(pendingIds.split(",").map((id) => getRadiographReading(id)));
      await reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pendingIds, isDoctor, reload]);

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

  function toggleReview(resultId: string) {
    setReviewing((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) next.delete(resultId);
      else next.add(resultId);
      return next;
    });
  }

  function readingChip(r: ExamResultFile) {
    if (!r.reading) return null;
    const { status, confirmed } = r.reading;
    const cls = confirmed
      ? styles.chipConfirmed
      : isPending(status)
        ? styles.chipPending
        : status === "ready"
          ? styles.chipReady
          : styles.chipManual;
    return (
      <span className={`${styles.chip} ${cls}`} aria-live="polite">
        {confirmed ? t("radiology.statusConfirmed") : t(STATUS_KEY[status])}
      </span>
    );
  }

  const shown = (rows ?? []).filter((e) => e.status === "ordered" || e.status === "done");
  return (
    <section className={styles.card} aria-label={t("shared.examsTitle")}>
      <div className={styles.header}>
        <h3 className={styles.h3}>{t("shared.examsTitle")}</h3>
        {isDoctor && !adding ? (
          <button type="button" className={styles.ghost} onClick={() => setAdding(true)}>
            {t("radiology.addOutside")}
          </button>
        ) : null}
      </div>
      {isDoctor && adding ? (
        <OutsideUpload
          patientId={patientId}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void reload();
          }}
        />
      ) : null}
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
            <div key={r.id} className={styles.resultBlock}>
              <div className={styles.result}>
                <button className={styles.file} onClick={() => void open(r.id)}>{r.file_name}</button>
                {readingChip(r)}
                {r.report_text ? <span dir="auto">“{r.report_text}”</span> : null}
                {r.uploaded_by_name ? <span className={styles.dept}>· {r.uploaded_by_name}</span> : null}
                {isDoctor && r.reading ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    aria-expanded={reviewing.has(r.id)}
                    onClick={() => toggleReview(r.id)}
                  >
                    {reviewing.has(r.id) ? t("radiology.hide") : t("radiology.review")}
                  </button>
                ) : null}
              </div>
              {isDoctor && r.reading && reviewing.has(r.id) ? (
                <RadiographReadingCard
                  resultId={r.id}
                  onConfirmed={() => void reload()}
                  onStatus={(s) => {
                    if (s !== r.reading?.status) void reload();
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function OutsideUpload({ patientId, onCancel, onDone }: { patientId: string; onCancel: () => void; onDone: () => void }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(() => t("radiology.outsideTitleDefault"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await uploadOutsideRadiograph(patientId, file, title.trim() || t("radiology.outsideTitleDefault"));
      onDone();
    } catch (err) {
      // Mock mode has no image store: say so plainly instead of a bare failure.
      setError(
        err instanceof ApiError && err.code === "needs_backend"
          ? `${t("radiology.uploadError")} ${err.message}`
          : t("radiology.uploadError"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.upload}>
      <label className={styles.field}>
        <span>{t("radiology.outsideFile")}</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
      </label>
      <label className={styles.field}>
        <span>{t("radiology.outsideTitle")}</span>
        <input dir="auto" className={styles.input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} disabled={!file || busy} onClick={() => void send()}>
          {busy ? t("radiology.uploading") : t("radiology.upload")}
        </button>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>
          {t("radiology.cancel")}
        </button>
      </div>
      {error ? <p className={styles.warn} role="alert">{error}</p> : null}
    </div>
  );
}
