"use client";

// One patient screen inside the phone frame: status bar, the Ward brand row, the body
// (passed as children; each screen sets its own padding) and, on Home and My vitals, the tab bar.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getMyAppointments } from "@/lib/api";
import { now, tunisTime } from "@/lib/time";
import { myPatientId } from "./patient";
import styles from "./Patient.module.css";

export type PatientTab = "home" | "vitals" | "assistant" | "appts";

export interface PatientScreenProps {
  /** Status bar clock. Default: the demo clock ("09:12"). */
  time?: string;
  /** Status bar signal and battery icons (the "Confirmed" screen has none). */
  icons?: boolean;
  /** The "Ward · Prototype · simulated data" row. */
  brand?: boolean;
  /** Show the tab bar with this tab active. */
  nav?: PatientTab;
  /** Appointments tab target; default: the next appointment, found on demand. */
  apptHref?: string;
  children: ReactNode;
}

export function PatientScreen({ time, icons = true, brand = true, nav, apptHref, children }: PatientScreenProps) {
  return (
    <>
      <div className={styles.statusBar} aria-hidden="true">
        <span>{time ?? tunisTime(now().toISOString())}</span>
        {icons ? (
          <span className={styles.statusIcons}>
            <span className={styles.signal} />
            <span className={styles.battery} />
          </span>
        ) : null}
      </div>
      {brand ? <Brand /> : null}
      {children}
      {nav ? <TabBar active={nav} apptHref={apptHref} /> : null}
    </>
  );
}

export function Brand() {
  return (
    <div className={styles.brand}>
      <span className={styles.brandMark} />
      <Link href="/patient" className={styles.brandName}>
        Ward
      </Link>
      <span className={styles.flex} />
      <span className={styles.protoTag}>Prototype · simulated data</span>
    </div>
  );
}

const TABS: { key: PatientTab; label: string; shape: string }[] = [
  { key: "home", label: "Home", shape: "tabHome" },
  { key: "vitals", label: "My vitals", shape: "tabVitals" },
  { key: "assistant", label: "Assistant", shape: "tabAssistant" },
  { key: "appts", label: "Appointments", shape: "tabAppts" },
];

/** The next appointment's page, or Home when there is none. */
function useApptHref(given?: string): string {
  const [href, setHref] = useState(given ?? "/patient");
  useEffect(() => {
    if (given) return;
    let alive = true;
    myPatientId()
      .then(getMyAppointments)
      .then((list) => {
        const t = now().getTime();
        const next = list.find((a) => a.status !== "cancelled" && a.slot_at && Date.parse(a.slot_at) >= t) ?? list.find((a) => a.status !== "cancelled");
        if (alive && next) setHref(`/patient/appointments/${next.id}`);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [given]);
  return given ?? href;
}

export function TabBar({ active, apptHref }: { active: PatientTab; apptHref?: string }) {
  const appts = useApptHref(apptHref);
  const hrefs: Record<PatientTab, string> = { home: "/patient", vitals: "/patient/vitals", assistant: "/patient/assistant", appts };
  return (
    <nav className={styles.tabBar} aria-label="Patient">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={hrefs[t.key]}
          className={`${styles.tab} ${t.key === active ? styles.tabActive : ""}`}
          aria-current={t.key === active ? "page" : undefined}
        >
          <span className={`${styles.tabIcon} ${styles[t.shape]}`} aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Patient / States · loading: a shimmer title and three placeholder rows. */
export function SkeletonCard() {
  return (
    <div aria-busy="true" aria-label="Loading" className={styles.skelCard}>
      <span className={`${styles.skelTitle} ward-skeleton`} />
      {[1, 2, 3].map((k) => (
        <div key={k} className={styles.skelRow}>
          <span className={styles.skelTime} />
          <span className={styles.skelText} />
          <span className={styles.skelPill} />
        </div>
      ))}
    </div>
  );
}

/** Patient / States · offline. */
export function OfflineBanner({ since }: { since: string }) {
  return (
    <div role="status" className={styles.offline}>
      <span className={styles.offlineRing} />
      <span>
        <b>You’re offline.</b> Showing your schedule from {since}. Your bedside unit still reminds you.
      </span>
    </div>
  );
}

/** Patient / States · empty card (title + one line). */
export function EmptyCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.emptyCard}>
      <span className={styles.emptyTitle}>{title}</span>
      <span className={styles.emptyText}>{children}</span>
    </div>
  );
}

export default PatientScreen;
