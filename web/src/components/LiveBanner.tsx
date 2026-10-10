"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import styles from "./LiveBanner.module.css";

export interface LiveBannerProps {
  /** Bold lead, e.g. "Live data paused — reconnecting…". */
  title?: string;
  /** Rest of the sentence, e.g. "Showing values from 09:11:48. NEWS2 and alerts will refresh when the connection returns." */
  children?: ReactNode;
  /** Smaller variant used inside the "States" cards (14 px, tighter padding). */
  compact?: boolean;
  className?: string;
}

/** The amber "reconnecting" banner (role="status") with the blinking ring. */
export function LiveBanner({ title, children, compact, className }: LiveBannerProps) {
  const { t } = useT();
  return (
    <div role="status" className={`${styles.root} ${compact ? styles.compact : ""} ${className ?? ""}`}>
      <span className={styles.ring} />
      <span>
        <b>{title ?? t("common.livePaused")}</b>
        {children ? <> {children}</> : null}
      </span>
    </div>
  );
}

export default LiveBanner;
