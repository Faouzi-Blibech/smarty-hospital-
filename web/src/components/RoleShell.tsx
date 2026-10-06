"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { useDemoFlags } from "@/lib/demo";
import { activeKeyFor, Sidebar, type StaffRole } from "./Sidebar";
import styles from "./RoleShell.module.css";

export interface RoleShellProps {
  role: StaffRole;
  /** Nav key override; by default derived from the pathname. */
  active?: string;
  /** Live override; by default `?live=0` turns it off. */
  live?: boolean;
  /** Narrow the sidebar to 216 px at 1024 px and below (the nurse tablet frame). */
  tablet?: boolean;
  children: ReactNode;
}

function ShellSidebar({ role, active, live }: Omit<RoleShellProps, "children">) {
  const pathname = usePathname();
  const flags = useDemoFlags();
  return <Sidebar role={role} active={active ?? activeKeyFor(role, pathname)} live={live ?? flags.live} />;
}

function StaticSidebar({ role, active, live }: Omit<RoleShellProps, "children">) {
  const pathname = usePathname();
  return <Sidebar role={role} active={active ?? activeKeyFor(role, pathname)} live={live ?? true} />;
}

/**
 * Sidebar (248 px) + full-height `main` on the canvas. Used by the doctor, nurse
 * and admin layouts. `main` has no padding: each page sets the design's own.
 */
export function RoleShell({ role, active, live, tablet, children }: RoleShellProps) {
  return (
    <div className={styles.shell}>
      <aside className={`${styles.aside} ${tablet ? styles.asideTablet : ""}`}>
        <Suspense fallback={<StaticSidebar role={role} active={active} live={live} />}>
          <ShellSidebar role={role} active={active} live={live} />
        </Suspense>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

export default RoleShell;
