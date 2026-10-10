"use client";

// Daily summary card: AI suggestion badge, summary text, "Based on" chips, drug
// interactions (fixed rules) and the human review step (Mark as reviewed / Undo).
import { useEffect, useState } from "react";
import { AiBadge } from "@/components/AiBadge";
import { useT } from "@/i18n/I18nProvider";
import type { Key } from "@/i18n/messages";
import { ApiError, getSummary, reviewSummary } from "@/lib/api";
import { tunisTime, USE_MOCKS } from "@/lib/time";
import type { AiSummary, Severity } from "@/lib/types";
import styles from "./DailySummary.module.css";

const SEV: Record<Severity, { word: Key; bg: string; fg: string }> = {
  high: { word: "doctor.sevHigh", bg: "var(--news-crit-bg)", fg: "var(--news-crit-fg)" },
  medium: { word: "doctor.sevMedium", bg: "var(--news-low-bg)", fg: "var(--news-low-fg)" },
  low: { word: "doctor.sevLow", bg: "var(--news-normal-bg)", fg: "var(--news-normal-fg)" },
};

/** Emphasise trend sentences (UI-only formatting of the summary text). */
function SummaryText({ text }: { text: string }) {
  const parts = text.split(/(?<=\.)\s+(?=[A-Z])/);
  return (
    <p dir="auto" className={styles.text}>
      {parts.map((s, i) => (
        <span key={i}>
          {i ? " " : ""}
          {/trending/i.test(s) ? <b className={styles.emph}>{s}</b> : s}
        </span>
      ))}
    </p>
  );
}

export interface DailySummaryProps {
  patientId: string;
  /** `?ai=rules`: AI unavailable, rules-only summary. */
  aiFallback: boolean;
  /** Reviewer user id (mock mode). */
  actorId: string;
}

export function DailySummary({ patientId, aiFallback, actorId }: DailySummaryProps) {
  const { t } = useT();
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [reviewError, setReviewError] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    getSummary(patientId, { fallback: aiFallback })
      .then((s) => {
        if (!alive) return;
        setSummary(s);
        setStatus("ready");
      })
      .catch((e) => {
        if (!alive) return;
        setStatus(e instanceof ApiError && e.status === 404 ? "none" : "error");
      });
    return () => {
      alive = false;
    };
  }, [patientId, aiFallback]);

  async function review() {
    if (busy) return;
    setBusy(true);
    setReviewError(false);
    try {
      setSummary(await reviewSummary(patientId, { by: actorId, fallback: aiFallback }));
    } catch {
      setReviewError(true);
    } finally {
      setBusy(false);
    }
  }

  // No undo endpoint in the contract: undo is local state, so it only shows in mock mode.
  function undo() {
    setSummary((s) => (s ? { ...s, human_confirmed_by: null, human_confirmed_by_name: null, reviewed_at: null } : s));
  }

  const source = summary?.source ?? (aiFallback ? "rules" : "model");
  const reviewed = !!summary?.human_confirmed_by;
  const reviewedLabel = reviewed
    ? summary?.reviewed_at
      ? t("doctor.reviewedByAt", { name: summary.human_confirmed_by_name ?? summary.human_confirmed_by ?? "", time: tunisTime(summary.reviewed_at) })
      : t("doctor.reviewedBy", { name: summary?.human_confirmed_by_name ?? summary?.human_confirmed_by ?? "" })
    : undefined;

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.h3}>{t("doctor.summaryTitle")}</h3>
        <AiBadge source={source} state={reviewed ? "reviewed" : "needs_review"} stateLabel={reviewedLabel} className={styles.badge} />
      </div>
      {source === "rules" ? (
        <span className={styles.fallback}>{t("doctor.summaryFallback")}</span>
      ) : null}

      {status === "loading" ? (
        <div className={styles.skel} aria-busy="true">
          <span className="ward-skeleton" style={{ height: 14, width: "92%" }} />
          <span className="ward-skeleton" style={{ height: 14, width: "80%" }} />
          <span className="ward-skeleton" style={{ height: 14, width: "64%" }} />
        </div>
      ) : status === "none" ? (
        <p className={styles.muted}>{t("doctor.summaryNone")}</p>
      ) : status === "error" ? (
        <p role="alert" className={styles.muted}>
          {t("doctor.summaryError")}
        </p>
      ) : summary ? (
        <>
          <SummaryText text={summary.summary} />
          {summary.based_on ? (
            <div className={styles.based}>
              <span className={styles.basedLabel}>{t("doctor.basedOn")}</span>
              <span className={styles.basedChip}>{t("doctor.basedVitals", { n: summary.based_on.vitals })}</span>
              <span className={styles.basedChip}>{t("doctor.basedDoses", { n: summary.based_on.doses })}</span>
              <span className={styles.basedChip}>{t("doctor.basedNotes", { n: summary.based_on.notes })}</span>
            </div>
          ) : null}
          <div className={styles.ix}>
            <span className={styles.ixHead}>
              {t("doctor.drugInteractions")}<span className={styles.ixNote}>{t("doctor.fixedRulesNotAi")}</span>
            </span>
            {summary.interactions.length === 0 ? <span className={styles.ixWhy}>{t("doctor.noneFound")}</span> : null}
            {summary.interactions.map((ix) => {
              const sev = SEV[ix.severity];
              return (
                <div key={ix.drugs.join("+")} className={styles.ixRow}>
                  <span className={styles.ixPair}>{ix.drugs.join(" + ")}</span>
                  <span className={styles.ixSev} style={{ background: sev.bg, color: sev.fg }}>
                    {t(sev.word)}
                  </span>
                  <span className={styles.ixWhy}>{ix.note}</span>
                </div>
              );
            })}
          </div>
          {reviewed ? (
            <div className={styles.reviewed}>
              <span className={styles.check}>✓</span>
              {reviewedLabel?.replace(/^✓ /, "")}
              {USE_MOCKS ? (
                <button type="button" onClick={undo} className={styles.undo}>
                  {t("doctor.undo")}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <button type="button" onClick={review} disabled={busy} className={styles.review}>
                {t("doctor.markReviewed")}
              </button>
              {reviewError ? (
                <span role="alert" className={styles.reviewError}>
                  {t("doctor.reviewError")}
                </span>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export default DailySummary;
