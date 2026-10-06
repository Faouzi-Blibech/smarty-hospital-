"use client";

// The design's error state: a card with a red alert box, then "Try again" and a secondary button.
// First used in Doctor / States ("Couldn’t load your patients."), shared by every role.
import type { ReactNode } from "react";
import styles from "./ErrorCard.module.css";

export interface ErrorCardProps {
  /** Bold first line, e.g. "Couldn’t load the devices." */
  title: ReactNode;
  /** Second line. Default: the design's reassurance line. */
  message?: ReactNode;
  /** Primary button handler. Omit to hide the button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Secondary button label. Default "Report a problem"; pass null to hide it. */
  secondaryLabel?: string | null;
  onSecondary?: () => void;
  className?: string;
}

export function ErrorCard({
  title,
  message = "The server didn’t answer. Your data is safe — nothing was changed.",
  onRetry,
  retryLabel = "Try again",
  secondaryLabel = "Report a problem",
  onSecondary,
  className,
}: ErrorCardProps) {
  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div role="alert" className={styles.alert}>
        <span className={styles.icon}>!</span>
        <div className={styles.text}>
          <b>{title}</b>
          {message ? <span>{message}</span> : null}
        </div>
      </div>
      {onRetry || secondaryLabel ? (
        <div className={styles.actions}>
          {onRetry ? (
            <button type="button" className={styles.primary} onClick={onRetry}>
              {retryLabel}
            </button>
          ) : null}
          {secondaryLabel ? (
            <button type="button" className={styles.secondary} onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ErrorCard;
