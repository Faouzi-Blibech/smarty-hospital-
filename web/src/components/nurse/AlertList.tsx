"use client";

// The nurse alerts list (board side panel and /nurse/alerts): open first, newest first,
// each with "Acknowledge" or "✓ Acknowledged by …". Trend alerts carry the AI chip.
import { useT } from "@/i18n/I18nProvider";
import { aiSourceLabel } from "@/lib/labels";
import { tunisTime } from "@/lib/time";
import type { Alert } from "@/lib/types";
import { alertOrder, KIND_LABEL, severityPill } from "./nurse";
import styles from "./AlertList.module.css";

export interface AlertCardProps {
  alert: Alert;
  aiFallback: boolean;
  /** Extra words after "Acknowledged by …" ("(on my way)"). */
  note?: string;
  busy?: boolean;
  onAck: (id: string) => void;
}

export function AlertCard({ alert: a, aiFallback, note, busy, onAck }: AlertCardProps) {
  const { t } = useT();
  const acked = !!a.acked_by;
  const crit = a.severity === "critical" && a.kind !== "call_nurse";
  const call = a.kind === "call_nurse";
  const sev = severityPill(a, t);
  const trendFallback = a.kind === "trend" && aiFallback && !acked;
  const border = acked
    ? "1px solid var(--line)"
    : crit
      ? "2px solid var(--news-crit-edge)"
      : call
        ? "2px solid var(--danger)"
        : `1px solid ${trendFallback ? "var(--trend-line)" : "var(--line)"}`;
  const bg = acked ? "var(--canvas)" : crit ? "var(--news-crit-bg)" : call ? "var(--danger-bg)" : "var(--paper)";
  const btnBg = crit ? "var(--news-crit-edge)" : call ? "var(--danger)" : "var(--ink)";
  return (
    <div
      className={styles.card}
      style={{ border, background: bg, opacity: acked ? 0.75 : 1, animation: crit && !acked ? "wardPulse 2.4s ease-in-out infinite" : "none" }}
    >
      <div className={styles.head}>
        <span className={styles.kind}>{t(KIND_LABEL[a.kind])}</span>
        <span className={styles.sev} style={{ background: sev.bg, color: sev.fg }}>
          {sev.word}
        </span>
        <span className={styles.spacer} />
        <span className={styles.time}>{tunisTime(a.created_at)}</span>
      </div>
      <div className={styles.where}>
        <span className={styles.bed}>{t("nurse.bed", { bed: a.bed ?? "—" })}</span>
        <span dir="auto" className={styles.who}>
          {a.patient_first_name ?? a.patient_id}
        </span>
      </div>
      <span className={styles.msg} style={{ fontWeight: crit ? 700 : 500 }}>
        {a.message}
      </span>
      {a.kind === "trend" ? (
        <span className={styles.ai}>
          <span className={styles.aiChip}>
            <span className={styles.aiDot} style={{ background: aiFallback ? "transparent" : "var(--ai)" }} />
            {t("nurse.aiSuggestion", { source: aiSourceLabel(aiFallback ? "rules" : "model", t) })}
          </span>
          <span className={styles.review}>{t("nurse.needsReview")}</span>
        </span>
      ) : null}
      {!acked ? (
        <button
          type="button"
          className={styles.ack}
          style={{ background: btnBg }}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => onAck(a.id)}
        >
          {t("nurse.acknowledge")}
        </button>
      ) : (
        <span className={styles.acked}>
          {t("nurse.ackedBy", { name: a.acked_by_name ?? a.acked_by ?? "" })}
          {a.acked_at ? ` · ${tunisTime(a.acked_at)}` : ""}
          {note ? ` ${note}` : ""}
        </span>
      )}
    </div>
  );
}

/** Nurse / States · "Alerts · Empty". */
export function AlertsEmpty() {
  const { t } = useT();
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>✓</span>
      <span className={styles.emptyTitle}>{t("nurse.noOpenAlerts")}</span>
      <span className={styles.emptyText}>{t("nurse.newAlertsHere")}</span>
    </div>
  );
}

export function AlertSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true">
      <span className="ward-skeleton" style={{ height: 12, width: 120 }} />
      <span className="ward-skeleton" style={{ height: 22, width: 140 }} />
      <span className="ward-skeleton" style={{ height: 16, width: "100%" }} />
    </div>
  );
}

export interface AlertListProps {
  alerts: Alert[];
  aiFallback: boolean;
  notes: Readonly<Record<string, string>>;
  busy: ReadonlySet<string>;
  onAck: (id: string) => void;
  /** `?state=empty`: show the empty state whatever the data. */
  forceEmpty?: boolean;
}

/** Empty state when nothing is open, then every alert (acknowledged ones last). */
export function AlertList({ alerts, aiFallback, notes, busy, onAck, forceEmpty }: AlertListProps) {
  const list = forceEmpty ? [] : alertOrder(alerts);
  const open = list.filter((a) => !a.acked_by).length;
  return (
    <>
      {open === 0 ? <AlertsEmpty /> : null}
      {list.map((a) => (
        <AlertCard key={a.id} alert={a} aiFallback={aiFallback} note={notes[a.id]} busy={busy.has(a.id)} onAck={onAck} />
      ))}
    </>
  );
}

export default AlertList;
