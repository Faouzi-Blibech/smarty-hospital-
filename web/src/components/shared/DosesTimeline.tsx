// Doses timeline card: Scheduled → Dispensed by unit → Taken or Missed.
// Shared by the doctor patient detail and the nurse views.
"use client";

import type { ReactNode } from "react";
import { DEFAULT_LANG, type Lang } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { tEn, type Key, type TFn } from "@/i18n/messages";
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

const STATUS_WORD: Record<DoseStatus, Key> = {
  missed: "shared.doseStatusMissed",
  taken: "shared.doseStatusTaken",
  dispensed: "shared.doseStatusDispensed",
  scheduled: "shared.doseStatusScheduled",
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

const and = (xs: string[], t: TFn) =>
  xs.length < 2 ? xs.join("") : t("shared.listAnd", { a: xs.slice(0, -1).join(t("shared.listSep")), b: xs[xs.length - 1] });

function detailOf(d: Dose, t: TFn): string {
  const at = tunisTime(d.scheduled_at);
  switch (d.status) {
    case "missed":
      return d.slot != null
        ? t("shared.doseMissedSlot", { t: at, u: tunisTime(d.updated_at) })
        : t("shared.doseNotGiven", { u: tunisTime(d.updated_at) });
    case "taken":
      if (d.given_by_name) return `${t("shared.doseGivenBy", { name: d.given_by_name })} ${d.taken_at ? tunisTime(d.taken_at) : ""}`.trim();
      return t("shared.doseTaken", { t: at, u: d.taken_at ? tunisTime(d.taken_at) : at });
    case "dispensed":
      return t("shared.doseDispensedWaiting", { t: tunisTime(d.updated_at) });
    case "scheduled":
      return d.slot != null ? t("shared.doseWillOpen", { slot: d.slot, t: at }) : (d.instructions ?? t("shared.doseReminderOnly"));
  }
}

/**
 * Builds the timeline rows. Scheduled doses at the same time are merged into one row
 * ("Paracetamol + Warfarin · Slots 1 and 3"), as in the design; past doses stay separate.
 */
export function doseRows(doses: Dose[], ref?: Date, t: TFn = tEn, lang: Lang = DEFAULT_LANG): DoseRow[] {
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
    const base = { key: d.id, time: tunisTime(d.scheduled_at), day: dayLabel(d.scheduled_at, ref, lang), status: d.status };
    if (group.length > 1) {
      const slots = group.map((g) => g.slot).filter((s): s is number => s != null);
      return {
        ...base,
        med: group.flatMap((g) => g.meds.map(drugName)).join(" + "),
        detail: slots.length ? t("shared.doseSlots", { list: and(slots.map(String), t) }) : t("shared.doseReminderOnly"),
      };
    }
    const med = d.meds.join(" + ");
    return {
      ...base,
      med: d.slot != null ? t("shared.doseSlotMed", { med, n: d.slot }) : t("shared.doseReminderMed", { med }),
      detail: detailOf(d, t),
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
  title,
  subtitle,
  now,
  renderExtra,
  className,
}: DosesTimelineProps) {
  const { t, lang } = useT();
  const rows = doseRows(doses, now, t, lang);
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <h3 className={styles.title}>{title ?? t("shared.dosesTitle")}</h3>
      <span className={styles.subtitle}>{subtitle ?? t("shared.dosesSubtitle")}</span>
      {rows.length === 0 ? <span className={styles.empty}>{t("shared.dosesEmpty")}</span> : null}
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
                  {t(STATUS_WORD[r.status])}
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
