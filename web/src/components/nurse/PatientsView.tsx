"use client";

// /nurse/patients — the design has no dedicated screen: the ward's patients as bed
// cards (same component as the board), in bed order. Each card opens the detail.
import { useCallback, useEffect, useState } from "react";
import { pausedAt } from "@/components/doctor/PatientList";
import { LiveBanner } from "@/components/LiveBanner";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { useLiveTick } from "@/components/shared/useLiveTick";
import { getWard } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import type { WardBed } from "@/lib/types";
import { BedCard, BedCardSkeleton } from "./BedCard";
import { byBed, WARD_LABEL } from "./nurse";
import { useWardAlerts } from "./useWardAlerts";
import styles from "./NursePage.module.css";

export function PatientsView() {
  const flags = useDemoFlags();
  const { tick } = useLiveTick(flags.live);
  const { alerts } = useWardAlerts();
  const [beds, setBeds] = useState<WardBed[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getWard()
      .then((list) => setBeds(list.filter((b) => b.patient).sort(byBed)))
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const state = flags.state === "error" || failed ? "error" : flags.state === "loading" || !beds ? "loading" : null;
  const callFor = (patientId: string) =>
    (alerts ?? []).find((a) => a.kind === "call_nurse" && a.patient_id === patientId && !a.acked_by);

  return (
    <div className={styles.page}>
      {!flags.live ? (
        <LiveBanner className={styles.banner}>Values frozen at {pausedAt()}. Check patients in person if this lasts.</LiveBanner>
      ) : null}
      <div className={styles.head}>
        <h2 className={styles.title}>Patients</h2>
        <span className={styles.sub}>
          {WARD_LABEL}
          {beds && !state ? ` · ${beds.length} patients · by bed` : ""}
        </span>
      </div>
      {state === "error" ? (
        <ErrorCard
          variant="box"
          title="Couldn’t load the ward."
          message="Check patients in person until the board is back."
          onRetry={load}
          className={styles.error}
        />
      ) : (
        <div className={styles.grid}>
          {state === "loading" || !beds
            ? Array.from({ length: 6 }, (_, i) => <BedCardSkeleton key={i} />)
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
  );
}

export default PatientsView;
