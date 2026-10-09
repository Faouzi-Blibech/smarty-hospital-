"use client";

import Link from "next/link";
import { USE_MOCKS } from "@/lib/time";
import { initialsOf, useMe } from "@/lib/useMe";
import { NAV_COUNTS } from "@/mocks";
import styles from "./Sidebar.module.css";

export type StaffRole = "doctor" | "nurse" | "admin";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  count?: string;
  /** "hot" count: teal pill (nurse alerts). */
  hot?: boolean;
}

/** The design's people (mock mode). Real mode shows the signed-in user from GET /me. */
const USERS: Record<StaffRole, { name: string; sub: string; ini: string }> = {
  doctor: { name: "Dr Trabelsi", sub: "Doctor · Cardiology", ini: "DT" },
  nurse: { name: "Nurse Ines", sub: "Nurse · Ward C", ini: "NI" },
  admin: { name: "Mme Gharbi", sub: "Administration", ini: "MG" },
};

/** Real-mode subtitle: /me has no ward, so the role word is enough. */
const ROLE_SUB: Record<string, string> = { doctor: "Doctor", nurse: "Nurse", admin: "Administration", patient: "Patient" };

export const NAV: Record<StaffRole, NavItem[]> = {
  doctor: [
    { key: "patients", label: "My patients", href: "/doctor", count: NAV_COUNTS.doctor.patients },
    { key: "requests", label: "Appointment requests", href: "/doctor/requests", count: NAV_COUNTS.doctor.requests },
  ],
  nurse: [
    { key: "board", label: "Ward board", href: "/nurse", count: NAV_COUNTS.nurse.board },
    { key: "alerts", label: "Alerts", href: "/nurse/alerts", count: NAV_COUNTS.nurse.alerts, hot: true },
    { key: "meds", label: "Med round", href: "/nurse/meds", count: NAV_COUNTS.nurse.meds },
    { key: "exams", label: "Exams", href: "/nurse/exams" },
    { key: "patients", label: "Patients", href: "/nurse/patients", count: NAV_COUNTS.nurse.patients },
  ],
  admin: [
    { key: "dashboard", label: "Dashboard", href: "/admin", count: NAV_COUNTS.admin.dashboard },
    { key: "waitlist", label: "Waitlist", href: "/admin/waitlist", count: NAV_COUNTS.admin.waitlist },
    { key: "devices", label: "Beds & devices", href: "/admin/devices", count: NAV_COUNTS.admin.devices },
    { key: "staff", label: "Staff", href: "/admin/staff", count: NAV_COUNTS.admin.staff },
  ],
};

/** The nav key for a pathname: exact match, else the longest href prefix. */
export function activeKeyFor(role: StaffRole, pathname: string): string {
  const items = NAV[role];
  const exact = items.find((n) => n.href === pathname);
  if (exact) return exact.key;
  const prefix = items
    .filter((n) => pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return prefix?.key ?? items[0].key;
}

export interface SidebarProps {
  role: StaffRole;
  /** Nav key (e.g. "patients", "requests"); defaults to the first item. */
  active?: string;
  /** false → the "Reconnecting…" pill instead of "Live". */
  live?: boolean;
  /** Override the mock counts per nav key. */
  counts?: Partial<Record<string, string | number>>;
}

/** Role navigation, exactly as Sidebar.dc.html (248 px wide in the shell). */
export function Sidebar({ role, active, live = true, counts }: SidebarProps) {
  const items = NAV[role];
  const current = active ?? items[0].key;
  const me = useMe(role);
  const u = USE_MOCKS
    ? USERS[role]
    : { name: me?.name ?? "", sub: me ? (ROLE_SUB[me.role] ?? me.role) : "", ini: me ? initialsOf(me.name) : "" };
  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <div className={styles.wordmark}>
          <span className={styles.mark} />
          <span className={styles.name}>Ward</span>
        </div>
        <span className={styles.tag}>Prototype · simulated data</span>
      </div>
      <nav className={styles.nav}>
        {items.map((n) => {
          const on = n.key === current;
          // Real mode: no stats endpoint yet (proposed in api.md), so no count pills.
          const count = USE_MOCKS ? String(counts?.[n.key] ?? n.count ?? "") : String(counts?.[n.key] ?? "");
          return (
            <Link
              key={n.key}
              href={n.href}
              className={`${styles.item} ${on ? styles.itemOn : ""}`}
              aria-current={on ? "page" : undefined}
            >
              <span className={styles.dot} />
              <span className={styles.label}>{n.label}</span>
              {count && count !== "0" ? (
                <span className={`${styles.count} ${n.hot ? styles.countHot : ""}`}>{count}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className={styles.spacer} />
      <div className={styles.foot}>
        {live ? (
          // No live feed in real mode yet (snapshots only), so no "Live" pill there.
          USE_MOCKS ? (
            <span className={styles.live}>
              <span className={styles.liveDot} />
              Live
            </span>
          ) : null
        ) : (
          <span className={styles.paused}>
            <span className={styles.pausedDot} />
            Reconnecting…
          </span>
        )}
        <div className={styles.user}>
          <span className={styles.avatar}>{u.ini}</span>
          <div className={styles.who}>
            <span className={styles.userName}>{u.name}</span>
            <span className={styles.userSub}>{u.sub}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
