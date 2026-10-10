"use client";

import { useT } from "@/i18n/I18nProvider";
import type { Key } from "@/i18n/messages";
import { aiSourceLabel } from "@/lib/labels";
import type { AiSource } from "@/lib/types";
import styles from "./AiBadge.module.css";

export type AiReviewState = "needs_review" | "reviewed" | "overridden" | "confirmed";

export interface AiBadgeProps {
  source: AiSource;
  /** Review half. Keep "needs_review" until `human_confirmed_by` is set (locked rule). */
  state: AiReviewState;
  /** Text of the review half; defaults to "Needs review" / "Reviewed" / "Overridden" / "Confirmed". */
  stateLabel?: string;
  /** Extra shown before the source when the model answered, e.g. "92%". Hidden on rules fallback. */
  detail?: string;
  /**
   * "joined" = one bordered pill split in two (daily summary).
   * "split"  = two separate pills, 4 px apart (waitlist rows).
   */
  variant?: "joined" | "split";
  className?: string;
}

const DEFAULT_LABEL: Record<AiReviewState, Key> = {
  needs_review: "shared.reviewNeeds",
  reviewed: "shared.reviewReviewed",
  overridden: "shared.reviewOverridden",
  confirmed: "shared.reviewConfirmed",
};

/** "AI suggestion · {Model|Rules fallback}" plus the review state. */
export function AiBadge({ source, state, stateLabel, detail, variant = "joined", className }: AiBadgeProps) {
  const { t } = useT();
  const fallback = source === "rules";
  const text = `${t("shared.aiSuggestion")} · ${detail && !fallback ? `${detail} · ` : ""}${aiSourceLabel(source, t)}`;
  const label = stateLabel ?? t(DEFAULT_LABEL[state]);
  return (
    <span className={`${styles.root} ${styles[variant]} ${className ?? ""}`}>
      <span className={styles.source}>
        <span className={`${styles.diamond} ${fallback ? "" : styles.filled}`} />
        {text}
      </span>
      <span className={`${styles.state} ${styles[state]}`}>{label}</span>
    </span>
  );
}

export default AiBadge;
