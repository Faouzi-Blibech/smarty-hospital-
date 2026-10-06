// Doctor vitals card: HR, SpO2 and temperature over 24 h with normal bands, the NEWS2
// dots every 2 h and the time axis. Built from the shared chart pieces.
import { News2Strip } from "@/components/shared/News2Strip";
import { TimeAxisRow, trendOf, VitalChartRow } from "@/components/shared/VitalsChart";
import { dayLabel, tunisTime } from "@/lib/time";
import type { Vital } from "@/lib/types";
import styles from "./PatientDetail.module.css";

export interface VitalsCardProps {
  /** Oldest first. */
  vitals: Vital[];
  live: boolean;
  /** Seconds since the last reading (live tick). */
  sec: number;
  /** Simulated change on the latest heart rate (mock live tick). */
  hrJitter?: number;
  now: Date;
}

const nums = (vs: Vital[], k: "hr" | "spo2" | "temp") => vs.map((v) => v[k]).filter((x): x is number => x != null);

/** Seven evenly spaced labels: "Sun 09:00", "13:00", … "Now". */
function axisLabels(vitals: Vital[], ref: Date): string[] {
  if (vitals.length < 2) return ["Now"];
  const a = Date.parse(vitals[0].ts);
  const b = Date.parse(vitals[vitals.length - 1].ts);
  return Array.from({ length: 7 }, (_, k) => {
    if (k === 6) return "Now";
    const iso = new Date(a + ((b - a) * k) / 6).toISOString();
    const hour = `${tunisTime(iso).slice(0, 2)}:00`;
    const day = dayLabel(iso, ref);
    return k === 0 && day !== "Today" ? `${day} ${hour}` : hour;
  });
}

export function VitalsCard({ vitals, live, sec, hrJitter = 0, now }: VitalsCardProps) {
  const hr = nums(vitals, "hr");
  if (hr.length) hr[hr.length - 1] += hrJitter;
  const sp = nums(vitals, "spo2");
  const tp = nums(vitals, "temp");
  const news = vitals.filter((_, i) => i % 2 === 0).map((v) => v.news2 ?? 0);
  const paused = !live;

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.h3}>Vitals · last 24 h</h3>
        <span className={styles.spacer} />
        <span className={styles.liveTag} style={{ color: live ? "var(--news-normal-fg)" : "var(--news-low-fg)" }}>
          <span className={styles.liveDot} style={{ background: live ? "var(--teal)" : "var(--news-low-edge)" }} />
          {live ? `Live · updated ${sec} s ago` : "Paused · reconnecting…"}
        </span>
        <span className={styles.legend}>
          <span className={styles.swatch} />
          Normal range
        </span>
      </div>
      <VitalChartRow
        name="Heart rate"
        unit="bpm"
        values={hr}
        min={50}
        max={130}
        normalLo={51}
        normalHi={90}
        bandLabel="normal 51–90"
        trend={trendOf(hr, 10, "up")}
        paused={paused}
      />
      <VitalChartRow
        name="SpO2"
        unit="%"
        values={sp}
        min={86}
        max={100}
        normalLo={96}
        normalHi={100}
        bandLabel="normal ≥ 96"
        trend={trendOf(sp, 2, "down")}
        paused={paused}
      />
      <VitalChartRow
        name="Temperature"
        unit="°C"
        values={tp}
        min={35.5}
        max={39}
        normalLo={36.1}
        normalHi={38}
        bandLabel="normal 36.1–38.0"
        format={(v) => v.toFixed(1)}
        trend={trendOf(tp, 0.8, "up")}
        paused={paused}
      />
      <News2Strip scores={news} />
      <TimeAxisRow labels={axisLabels(vitals, now)} />
    </section>
  );
}

export default VitalsCard;
