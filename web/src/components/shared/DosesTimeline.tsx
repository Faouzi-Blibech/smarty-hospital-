// Doses timeline card: Scheduled → Dispensed by unit → Taken (confirmed) or Missed.
// Shared by the doctor patient detail and the nurse views.
import type { ReactNode } from "react";
import { dayLabel, tunisTime } from "@/lib/time";
import type { Dose, DoseStatus } from "@/lib/types";
import styles from "./DosesTimeline.module.css";

/** Status pill and dot colours (design `c` map): [bg, fg, border, dot, ring]. */
const STATUS_COLORS: Record<DoseStatus, [string, string, string, string, string]> = {
  missed: ["var(--news-crit-bg)", "var(--news-crit-fg)", "var(--news-crit-bg)", "var(--news-crit-edge)", "var(--news-crit-edge)"],
  taken: ["var(--news-normal-bg)", "var(--news-normal-fg)", "var(--news-normal-bg)", "var(--teal)", "var(--teal)"],
  dispensed: ["var(--news-low-bg)", "var(--news-low-fg)", "var(--news-low-bg)", "var(--news-low-edge)", "var(--news-low-edge)"],
  scheduled: ["transparent", "var(--text)", "var(--line-strong)", "transparent", "var(--faint)"],
};

const STATUS_WORD: Record<DoseStatus, string> = {
  missed: "Missed",
  taken: "Taken",
  dispensed: "Dispensed",
  scheduled: "Scheduled",
};

export interface DoseRow {
  key: string;
  time: string;
  day: string;
  med: string;
  status: DoseStatus;
  detail: string;
}

/** "Paracetamol 500mg" → "Paracetamol". */
const drugName = (med: string) => med.split(" ")[0];

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function detailOf(d: Dose): string {
  const t = tunisTime(d.scheduled_at);
  switch (d.status) {
    case "missed":
      return d.slot != null
        ? `Dispensed ${t} · not confirmed by ${tunisTime(d.updated_at)}`
        : `Not given by ${tunisTime(d.updated_at)}`;
    case "taken":
      if (d.given_by_name) return `Given by ${d.given_by_name} ${d.taken_at ? tunisTime(d.taken_at) : ""}`.trim();
      return `Dispensed ${t} · taken ${d.taken_at ? tunisTime(d.taken_at) : t}`;
    case "dispensed":
      return `Dispensed ${tunisTime(d.updated_at)} · waiting for confirmation`;
    case "scheduled":
      return d.slot != null ? `Unit will open slot ${d.slot} at ${t}` : (d.instructions ?? "Reminder only · nurse gives by hand");
  }
}

/**
 * Builds the timeline rows. Scheduled doses at the same time are merged into one row
 * ("Paracetamol + Warfarin · Slots 1 and 3"), as in the design; past doses stay separate.
 */
export function doseRows(doses: Dose[], ref?: Date): DoseRow[] {
  const sorted = [...doses].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const groups: Dose[][] = [];
  const scheduledAt = new Map<string, Dose[]>();
  for (const d of sorted) {
    const open = d.status === "scheduled" ? scheduledAt.get(d.scheduled_at) : undefined;
    if (open) {
      open.push(d);
      continue;
    }
    const group = [d];
    if (d.status === "scheduled") scheduledAt.set(d.scheduled_at, group);
    groups.push(group);
  }
  return groups.map((group) => {
    const d = group[0];
    const base = { key: d.id, time: tunisTime(d.scheduled_at), day: dayLabel(d.scheduled_at, ref), status: d.status };
    if (group.length > 1) {
      const slots = group.map((g) => g.slot).filter((s): s is number => s != null);
      return {
        ...base,
        med: group.flatMap((g) => g.meds.map(drugName)).join(" + "),
        detail: slots.length ? `Slots ${and(slots.map(String))}` : "Reminder only · nurse gives by hand",
      };
    }
    const med = d.meds.join(" + ");
    return {
      ...base,
      med: `${med} · ${d.slot != null ? `slot ${d.slot}` : "reminder"}`,
      detail: detailOf(d),
    };
  });
}

export interface DosesTimelineProps {
  doses: Dose[];
  title?: string;
  subtitle?: string;
  /** Reference "now" for the Today / weekday labels. */
  now?: Date;
  /** Optional content rendered under each row's detail (e.g. a nurse action), by dose id. */
  renderExtra?: (row: DoseRow) => ReactNode;
  className?: string;
}

export function DosesTimeline({
  doses,
  title = "Doses · last 24 h",
  subtitle = "Scheduled → Dispensed by unit → Taken (confirmed) or Missed",
  now,
  renderExtra,
  className,
}: DosesTimelineProps) {
  const rows = doseRows(doses, now);
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <h3 className={styles.title}>{title}</h3>
      <span className={styles.subtitle}>{subtitle}</span>
      {rows.length === 0 ? <span className={styles.empty}>No doses in this period.</span> : null}
      {rows.map((r) => {
        const [bg, fg, bd, dot, ring] = STATUS_COLORS[r.status];
        return (
          <div key={r.key} className={styles.row}>
            <div className={styles.when}>
              <span className={styles.time}>{r.time}</span>
              <span className={styles.day}>{r.day}</span>
            </div>
            <div className={styles.rail}>
              <span className={styles.dot} style={{ background: dot, borderColor: ring }} />
              <span className={styles.line} />
            </div>
            <div className={styles.body}>
              <div className={styles.head}>
                <span className={styles.med}>{r.med}</span>
                <span className={styles.status} style={{ background: bg, color: fg, borderColor: bd }}>
                  {STATUS_WORD[r.status]}
                </span>
              </div>
              <span className={styles.detail}>{r.detail}</span>
              {renderExtra?.(r)}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default DosesTimeline;
