"use client";

import type { CSSProperties } from "react";
import { useT } from "@/i18n/I18nProvider";
import { news2Word } from "@/lib/labels";
import { level, PULSE } from "@/lib/news2";
import styles from "./News2Badge.module.css";

export interface News2BadgeProps {
  score: number;
  /** Pulse animation; defaults to score ≥ 7. Pass false when live data is paused. */
  pulse?: boolean;
  /** "pill" = bubble + "NEWS2 · High" (patient list). "dot" = the 26 px circle (NEWS2 timeline, legends). */
  variant?: "pill" | "dot";
  className?: string;
  style?: CSSProperties;
}

/** NEWS2 score bubble with its word; colour never stands alone. */
export function News2Badge({ score, pulse, variant = "pill", className, style }: News2BadgeProps) {
  const { t } = useT();
  const lv = level(score);
  const word = news2Word(lv.word, t);
  const animate = pulse ?? score >= 7;
  if (variant === "dot") {
    return (
      <span
        title={`NEWS2 ${score} · ${word}`}
        className={`${styles.dot} ${className ?? ""}`}
        style={{ background: lv.bg, color: lv.fg, borderColor: lv.edge, ...style }}
      >
        {score}
      </span>
    );
  }
  return (
    <span
      className={`${styles.pill} ${className ?? ""}`}
      style={{ background: lv.bg, color: lv.fg, animation: animate ? PULSE : "none", ...style }}
    >
      <span className={styles.bubble} style={{ background: lv.edge }}>
        {score}
      </span>
      NEWS2 · {word}
    </span>
  );
}

export default News2Badge;
