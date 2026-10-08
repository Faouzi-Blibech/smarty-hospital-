"use client";

// Nurse / Ward board (/nurse), desktop 1440 and tablet 1024. Bed cards (highest NEWS2
// first), the alerts panel (a drawer on tablet), the red call banner (desktop) and the
// critical-alert toast (tablet).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveBanner } from "@/components/LiveBanner";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { useLiveTick } from "@/components/shared/useLiveTick";
import { Toast } from "@/components/Toast";
import { getWard } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { level } from "@/lib/news2";
import { pausedAt, tunisTime, tunisTimeSeconds, USE_MOCKS } from "@/lib/time";
import type { Alert, WardBed } from "@/lib/types";
import { AlertList, AlertSkeleton } from "./AlertList";
import { BedCard, BedCardSkeleton } from "./BedCard";
import { boardOrder, wardLabel } from "./nurse";
import { useWardAlerts } from "./useWardAlerts";
import styles from "./WardBoard.module.css";

const LEGEND: [number, string][] = [
  [0, "Normal 0"],
  [2, "Low 1–4"],
  [5, "High 5–6"],
  [7, "Critical 7+"],
];

const MUTE_MS = 60_000;

const newestOpen = (alerts: Alert[], pick: (a: Alert) => boolean) =>
  alerts.filter((a) => !a.acked_by && pick(a)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

export function WardBoard() {
  const flags = useDemoFlags();
  const { tick } = useLiveTick(flags.live && USE_MOCKS);
  const wardAlerts = useWardAlerts();
  const { alerts, ack, busy, notes, notice } = wardAlerts;
  const [beds, setBeds] = useState<WardBed[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [muted, setMuted] = useState<string | null>(null);
  const muteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getWard()
      .then((list) => setBeds(boardOrder(list)))
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);
  useEffect(() => () => {
    if (muteTimer.current) clearTimeout(muteTimer.current);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const retry = () => {
    load();
    wardAlerts.reload();
  };

  const forceEmpty = flags.state === "empty";
  const boardState = flags.state === "error" || failed ? "error" : flags.state === "loading" || !beds ? "loading" : null;
  const alertsState = flags.state === "error" || wardAlerts.failed ? "error" : flags.state === "loading" || !alerts ? "loading" : null;
  const list = alerts && !forceEmpty ? alerts : [];
  const openCount = list.filter((a) => !a.acked_by).length;

  const callAlert = newestOpen(list, (a) => a.kind === "call_nurse");
  const critAlert = newestOpen(list, (a) => a.kind !== "call_nurse" && a.severity === "critical");
  const callFor = (patientId: string) => newestOpen(list, (a) => a.kind === "call_nurse" && a.patient_id === patientId);
  const showCall = !!callAlert && muted !== callAlert.id && !boardState;

  const occupied = beds?.filter((b) => b.patient).length ?? 0;
  const emptyBeds = (beds?.length ?? 0) - occupied;

  function mute(id: string) {
    setMuted(id);
    if (muteTimer.current) clearTimeout(muteTimer.current);
    muteTimer.current = setTimeout(() => setMuted(null), MUTE_MS);
  }

  return (
    <div className={styles.board}>
      <div className={styles.main}>
        {!flags.live ? (
          <LiveBanner className={styles.banner}>Values frozen at {pausedAt()}. Check patients in person if this lasts.</LiveBanner>
        ) : null}
        <div className={styles.head}>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>{wardLabel((beds ?? []).map((b) => b.patient?.ward)) ?? "Ward board"}</h2>
            <span className={`${styles.sub} ${styles.desk}`}>
              {occupied} patients · {emptyBeds} empty bed{emptyBeds === 1 ? "" : "s"} · highest NEWS2 first
            </span>
          </div>
          <div className={`${styles.legend} ${styles.desk}`}>
            {LEGEND.map(([s, label]) => {
              const lv = level(s);
              return (
                <span key={label} className={styles.chip} style={{ background: lv.bg, color: lv.fg }}>
                  <span className={styles.chipDot} style={{ background: lv.edge }} />
                  {label}
                </span>
              );
            })}
          </div>
          <button
            type="button"
            className={`${styles.alertsBtn} ${styles.tab}`}
            aria-expanded={drawer}
            aria-controls="nurse-alerts"
            onClick={() => setDrawer(true)}
          >
            Alerts<span className={styles.alertsCount}>{openCount}</span>
          </button>
        </div>

        {boardState === "error" ? (
          <ErrorCard
            variant="box"
            title="Couldn’t load the ward."
            message="Check patients in person until the board is back."
            onRetry={retry}
            className={styles.error}
          />
        ) : (
          <div className={styles.grid}>
            {boardState === "loading" || !beds
              ? Array.from({ length: 8 }, (_, i) => <BedCardSkeleton key={i} />)
              : beds.map((b, i) => (
                  <BedCard
                    key={b.bed}
                    bed={b}
                    index={i}
                    live={flags.live}
                    tick={tick}
                    call={b.patient ? callFor(b.patient.id) : undefined}
                  />
                ))}
          </div>
        )}
      </div>

      <aside id="nurse-alerts" aria-label="Alerts" className={`${styles.aside} ${drawer ? styles.drawerOpen : ""}`}>
        <div className={styles.asideHead}>
          <h3 className={styles.asideTitle}>Alerts</h3>
          <span className={styles.openCount}>{openCount} open</span>
          <span className={styles.spacer} />
          <span className={styles.newest}>Newest first</span>
          <button type="button" className={`${styles.close} ${styles.tab}`} onClick={() => setDrawer(false)}>
            Close
          </button>
        </div>
        {alertsState === "error" ? (
          <ErrorCard
            variant="box"
            title="Couldn’t load alerts."
            message="Check patients in person until the board is back."
            onRetry={wardAlerts.reload}
          />
        ) : alertsState === "loading" ? (
          <>
            <AlertSkeleton />
            <AlertSkeleton />
            <AlertSkeleton />
          </>
        ) : (
          <AlertList
            alerts={list}
            aiFallback={flags.aiFallback}
            notes={notes}
            busy={busy}
            onAck={(id) => void ack(id)}
            forceEmpty={forceEmpty}
          />
        )}
      </aside>
      {drawer ? <div className={`${styles.scrim} ${styles.tab}`} onClick={() => setDrawer(false)} aria-hidden="true" /> : null}

      {showCall && callAlert ? (
        <div role="alert" className={`${styles.call} ${styles.desk}`}>
          <div className={styles.callTop}>
            <div className={styles.callText}>
              <span className={styles.callTitle}>Bed {callAlert.bed ?? "—"} is calling</span>
              <span dir="auto" className={styles.callSub}>
                {callAlert.patient_first_name ?? callAlert.patient_id} · call request {tunisTimeSeconds(callAlert.created_at)}
              </span>
            </div>
          </div>
          <div className={styles.callActions}>
            <button
              type="button"
              className={styles.onMyWay}
              disabled={busy.has(callAlert.id)}
              onClick={() => void ack(callAlert.id, "(on my way)")}
            >
              On my way
            </button>
            <button type="button" className={styles.mute} onClick={() => mute(callAlert.id)}>
              Snooze 1 min
            </button>
          </div>
        </div>
      ) : null}

      {critAlert && !boardState ? (
        <div role="alert" className={`${styles.critToast} ${styles.tab}`}>
          <div className={styles.critHead}>
            <span className={styles.critTag}>CRITICAL</span>
            <span className={styles.critMeta}>
              {critAlert.kind === "news2" ? "NEWS2 alert" : "Alert"} · {tunisTime(critAlert.created_at)}
            </span>
          </div>
          <span dir="auto" className={styles.critTitle}>
            Bed {critAlert.bed ?? "—"} · {critAlert.patient_first_name ?? critAlert.patient_id}
          </span>
          <span className={styles.critMsg}>{critAlert.message}</span>
          <div className={styles.critActions}>
            <button
              type="button"
              className={styles.critAck}
              disabled={busy.has(critAlert.id)}
              onClick={() => void ack(critAlert.id)}
            >
              Acknowledge
            </button>
            <Link href={`/nurse/patients/${encodeURIComponent(critAlert.patient_id)}`} className={styles.openBed}>
              Open bed
            </Link>
          </div>
        </div>
      ) : null}

      {notice ? <Toast tone="warn">{notice}</Toast> : null}
    </div>
  );
}

export default WardBoard;
