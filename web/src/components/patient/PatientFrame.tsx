// The patient PWA frame. Design: a 390 × 844 phone (radius 46, ink bezel) on the backdrop.
// At phone width (≤ 480 px) the app fills the screen and the fake status bar is hidden.
import type { ReactNode } from "react";
import styles from "./Patient.module.css";

export function PatientFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <div className={styles.phone}>{children}</div>
    </div>
  );
}

export default PatientFrame;
