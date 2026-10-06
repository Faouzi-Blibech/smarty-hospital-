"use client";

// Patient / My vitals (/patient/vitals): latest heart rate, oxygen and temperature in plain words
// ("Normal" / "Needs attention", from the usual ranges — never a NEWS2 or AI score), and the
// 24 h heart-rate line. Values are simulated for this prototype (the brand tag says so).
import { getVitals } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { ago, now, tunisTime } from "@/lib/time";
import type { Vital } from "@/lib/types";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { daysBetween, myPatientId, offlineSince, useLoad, useOffline, vitalWord } from "./patient";
import { EmptyCard, OfflineBanner, PatientScreen, SkeletonCard } from "./PatientScreen";
import styles from "./Patient.module.css";

const last = (vs: Vital[], k: "hr" | "spo2" | "temp") => {
  for (let i = vs.length - 1; i >= 0; i--) if (vs[i][k] != null) return vs[i][k] as number;
  return null;
};

/** The design's mapping: 300 × 90 box, 50–130 beats/min. */
function hrPoints(values: number[]): string {
  const n = values.length;
  return values
    .map((v, i) => {
      const x = n === 1 ? 300 : (i / (n - 1)) * 300;
      const y = Math.min(90, Math.max(0, 90 - ((v - 50) / 80) * 90));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function startLabel(iso: string): string {
  const d = daysBetween(iso, now().toISOString());
  const hour = `${tunisTime(iso).slice(0, 2)}:00`;
  return d === 0 ? `Today ${hour}` : d === 1 ? `Yesterday ${hour}` : hour;
}

export function VitalsView() {
  const flags = useDemoFlags();
  const offline = useOffline();
  const res = useLoad(async () => getVitals(await myPatientId()));

  const vitals = flags.state === "empty" ? [] : flags.state ? null : res.data;
  const failed = flags.state === "error" || (!!res.error && !res.data);

  const latest = vitals?.[vitals.length - 1];
  const hrSeries = (vitals ?? []).filter((v) => v.hr != null);
  const s = latest ? Math.round((now().getTime() - Date.parse(latest.ts)) / 1000) : 0;
  const updated = latest ? (s < 60 ? "a few seconds ago" : ago(latest.ts)) : null;

  const tiles = vitals
    ? [
        { key: "hr", label: "Heart rate", unit: "beats/min", value: last(vitals, "hr"), wide: false },
        { key: "spo2", label: "Oxygen", unit: "%", value: last(vitals, "spo2"), wide: false },
        { key: "temp", label: "Temperature", unit: "°C", value: last(vitals, "temp"), wide: true },
      ].filter((t) => t.value != null)
    : [];

  return (
    <PatientScreen nav="vitals">
      <div className={`${styles.scroll} ${styles.vitalsBody}`}>
        {offline ? <OfflineBanner since={offlineSince(res.loadedAt)} /> : null}
        <div className={styles.titleBlock}>
          <h1 className={styles.h1Small}>My vitals</h1>
          <span className={styles.sublineSmall}>
            Last 24 hours{updated ? ` · ${offline ? `paused at ${offlineSince(res.loadedAt)}` : `updated ${updated}`}` : ""}
          </span>
        </div>

        {failed ? (
          <ErrorCard
            variant="patient"
            title="Something went wrong."
            message="We couldn’t load your vitals."
            onRetry={flags.state === "error" ? undefined : res.retry}
          />
        ) : !vitals ? (
          <SkeletonCard />
        ) : tiles.length === 0 ? (
          <EmptyCard title="No readings yet">No readings yet today. Ask your nurse if that seems wrong.</EmptyCard>
        ) : (
          <>
            <div className={`${styles.tiles} ${offline ? styles.paused : ""}`}>
              {tiles.map((t) => {
                const v = t.value as number;
                const word = vitalWord(t.key as "hr" | "spo2" | "temp", v);
                return (
                  <div key={t.key} className={`${styles.tile} ${t.wide ? styles.tileWide : ""}`}>
                    <span className={styles.tileLabel}>{t.label}</span>
                    <span className={styles.tileValue}>
                      <span className={styles.tileNum}>{t.key === "temp" ? v.toFixed(1) : v}</span>
                      <span>{t.unit}</span>
                    </span>
                    <span className={`${styles.word} ${word === "Normal" ? styles.word_ok : styles.word_attention}`}>
                      <span className={styles.wordDot} />
                      {word}
                    </span>
                  </div>
                );
              })}
            </div>
            {hrSeries.length > 1 ? (
              <section className={styles.chartCard} aria-label="Heart rate over the last 24 hours">
                <span className={styles.chartTitle}>Heart rate · 24 h</span>
                <svg viewBox="0 0 300 90" className={styles.chart} role="img" aria-label="Heart rate line">
                  <rect x="0" y="45" width="300" height="34" className={styles.band} />
                  <polyline points={hrPoints(hrSeries.map((v) => v.hr as number))} className={styles.line} />
                </svg>
                <div className={styles.axis}>
                  <span>{startLabel(hrSeries[0].ts)}</span>
                  <span>Now</span>
                </div>
                <span className={styles.legend}>
                  <span className={styles.legendSwatch} />
                  Shaded = usual range
                </span>
              </section>
            ) : null}
          </>
        )}

        <div className={styles.careNote}>
          Your care team sees these too. If you feel unwell, press the call button or tap <b>Call nurse</b>.
        </div>
      </div>
    </PatientScreen>
  );
}

export default VitalsView;
