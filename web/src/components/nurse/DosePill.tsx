// Nurse dose status pill (design `ST`): Missed, Given, Taken, Dispensed, "Due in 48 min", Scheduled.
import { DOSE_PILL, type NurseDoseStatus } from "./nurse";
import styles from "./DosePill.module.css";

export function DosePill({ status, text, className }: { status: NurseDoseStatus; text: string; className?: string }) {
  const [bg, fg, bd] = DOSE_PILL[status];
  return (
    <span className={`${styles.pill} ${className ?? ""}`} style={{ background: bg, color: fg, borderColor: bd }}>
      {text}
    </span>
  );
}

export default DosePill;
