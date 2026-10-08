// The NEWS2 dots strip under the vitals charts: one 26 px dot per 2-hour window, evenly spaced.
// A window with no score shows an empty placeholder ring, not a dot.
import { News2Badge } from "@/components/News2Badge";
import styles from "./News2Strip.module.css";

export interface News2StripProps {
  /** Oldest first (13 two-hour windows); null = no reading in that window. */
  scores: (number | null)[];
  /** Left-hand label (160 px gutter). */
  label?: string;
}

export function News2Strip({ scores, label = "NEWS2 · every 2 h" }: News2StripProps) {
  const n = scores.length;
  const leftOf = (k: number) => `${(n > 1 ? (k / (n - 1)) * 100 : 0).toFixed(2)}%`;
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.track}>
        {scores.map((s, k) =>
          s == null ? (
            <span key={k} title="No reading" className={`${styles.dot} ${styles.empty}`} style={{ left: leftOf(k) }} />
          ) : (
            <News2Badge key={k} score={s} variant="dot" className={styles.dot} style={{ left: leftOf(k) }} />
          ),
        )}
      </div>
    </div>
  );
}

export default News2Strip;
