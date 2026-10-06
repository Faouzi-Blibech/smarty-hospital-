// The NEWS2 dots strip under the vitals charts: one 26 px dot per score, evenly spaced.
import { News2Badge } from "@/components/News2Badge";
import styles from "./News2Strip.module.css";

export interface News2StripProps {
  /** Oldest first. */
  scores: number[];
  /** Left-hand label (160 px gutter). */
  label?: string;
}

export function News2Strip({ scores, label = "NEWS2 · every 2 h" }: News2StripProps) {
  const n = scores.length;
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.track}>
        {scores.map((s, k) => (
          <News2Badge
            key={k}
            score={s}
            variant="dot"
            className={styles.dot}
            style={{ left: `${(n > 1 ? (k / (n - 1)) * 100 : 0).toFixed(2)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default News2Strip;
