"use client";

// Doctor / Appointment requests (/doctor/requests): the shared Waitlist, Cardiology only.
import { Waitlist } from "@/components/Waitlist";
import { useDemoFlags } from "@/lib/demo";
import styles from "./RequestsView.module.css";

export function RequestsView() {
  const flags = useDemoFlags();
  return (
    <div className={styles.page}>
      <div className={styles.titles}>
        <h2 className={styles.h2}>Appointment requests</h2>
        <span className={styles.sub}>Ranked by the AI as a suggestion. You confirm each one.</span>
      </div>
      <div className={styles.waitlist}>
        <Waitlist specialty="Cardiology" actor="Dr Trabelsi" actorId="u-0001" doctorId="u-0001" aiFallback={flags.aiFallback} />
      </div>
    </div>
  );
}

export default RequestsView;
