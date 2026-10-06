"use client";

// /nurse/alerts — the design has no dedicated screen: the board's alerts panel as a page.
import { pausedAt } from "@/components/doctor/PatientList";
import { LiveBanner } from "@/components/LiveBanner";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { Toast } from "@/components/Toast";
import { useDemoFlags } from "@/lib/demo";
import { AlertList, AlertSkeleton } from "./AlertList";
import { WARD_LABEL } from "./nurse";
import { useWardAlerts } from "./useWardAlerts";
import styles from "./NursePage.module.css";

export function AlertsView() {
  const flags = useDemoFlags();
  const { alerts, failed, reload, ack, busy, notes, notice } = useWardAlerts();
  const forceEmpty = flags.state === "empty";
  const state = flags.state === "error" || failed ? "error" : flags.state === "loading" || !alerts ? "loading" : null;
  const openCount = forceEmpty ? 0 : (alerts ?? []).filter((a) => !a.acked_by).length;

  return (
    <div className={styles.page}>
      {!flags.live ? (
        <LiveBanner className={styles.banner}>Values frozen at {pausedAt()}. Check patients in person if this lasts.</LiveBanner>
      ) : null}
      <div className={styles.head}>
        <h2 className={styles.title}>Alerts</h2>
        <span className={styles.sub}>{state ? WARD_LABEL : `${WARD_LABEL} · ${openCount} open · newest first`}</span>
      </div>
      <div className={styles.list}>
        {state === "error" ? (
          <ErrorCard
            variant="box"
            title="Couldn’t load alerts."
            message="Alerts still sound on bedside units. Check patients in person."
            onRetry={reload}
          />
        ) : state === "loading" || !alerts ? (
          <>
            <AlertSkeleton />
            <AlertSkeleton />
            <AlertSkeleton />
          </>
        ) : (
          <AlertList
            alerts={alerts}
            aiFallback={flags.aiFallback}
            notes={notes}
            busy={busy}
            onAck={(id) => void ack(id)}
            forceEmpty={forceEmpty}
          />
        )}
      </div>
      {notice ? <Toast tone="warn">{notice}</Toast> : null}
    </div>
  );
}

export default AlertsView;
