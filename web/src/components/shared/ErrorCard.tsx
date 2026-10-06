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
  /**
   * "card" (default): a card holding the red alert box, then the buttons.
   * "box": the nurse States "Ward board · Error" — one red box with the title,
   * the message and the primary button inside it (no icon, no secondary button).
   * "patient": Patient / States — one red box, bold title and message on one line,
   * then a 48 px "Try again" button (patient app sizes: 16 px text, 12 px radius).
   */
  variant?: "card" | "box" | "patient";
  className?: string;
}

export function ErrorCard({
  title,
  message = "The server didn’t answer. Your data is safe — nothing was changed.",
  onRetry,
  retryLabel = "Try again",
  secondaryLabel = "Report a problem",
  onSecondary,
  variant = "card",
  className,
}: ErrorCardProps) {
  if (variant === "patient") {
    return (
      <div role="alert" className={`${styles.patient} ${className ?? ""}`}>
        <span>
          <b>{title}</b>
          {message ? <> {message}</> : null}
        </span>
        {onRetry ? (
          <button type="button" className={styles.patientButton} onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }
  if (variant === "box") {
    return (
      <div role="alert" className={`${styles.box} ${className ?? ""}`}>
        <span className={styles.boxTitle}>{title}</span>
        {message ? <span className={styles.boxMessage}>{message}</span> : null}
        {onRetry ? (
          <button type="button" className={styles.boxButton} onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }
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
