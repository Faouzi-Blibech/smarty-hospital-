// One vitals chart row (label + value + SVG with the normal band and last-point dot),
// plus the time axis row. Shared by the doctor patient detail and the nurse views.
import type { ReactNode } from "react";
import styles from "./VitalsChart.module.css";

const W = 600;
const H = 84;
/** When paused, the real line stops at 90 % and a dashed segment fills the rest (never interpolated). */
const PAUSED_SPAN = 0.9;

export interface Trend {
  /** "↑", "↓" or "→". */
  arrow: string;
  /** "rising", "falling", "steady". */
  word: string;
  /** Text colour of the arrow. */
  color: string;
}

/**
 * Trend of a series, first vs last value. `threshold` is the change that counts as a move;
 * `concerning` is the direction that gets the warning colour (HR up, SpO2 down…).
 */
export function trendOf(values: number[], threshold: number, concerning: "up" | "down" | "both" = "both"): Trend {
  const d = values.length > 1 ? values[values.length - 1] - values[0] : 0;
  if (Math.abs(d) < threshold) return { arrow: "→", word: "steady", color: "var(--muted)" };
  const up = d > 0;
  const bad = concerning === "both" || (concerning === "up") === up;
  return { arrow: up ? "↑" : "↓", word: up ? "rising" : "falling", color: bad ? "var(--news-high-fg)" : "var(--muted)" };
}

/** "72–118" (min–max of the series). */
export function rangeOf(values: number[], format: (v: number) => string = String): string {
  if (!values.length) return "—";
  return `${format(Math.min(...values))}–${format(Math.max(...values))}`;
}

export interface VitalChartRowProps {
  name: string;
  unit: string;
  /** Oldest first; the last value is the current reading. */
  values: number[];
  /** Y axis domain. */
  min: number;
  max: number;
  /** Normal band (shaded green). */
  normalLo: number;
  normalHi: number;
  /** "normal 51–90" shown in the top-left of the chart. */
  bandLabel: string;
  format?: (v: number) => string;
  trend?: Trend;
  /** Overrides the computed min–max range text. */
  range?: string;
  /** Live data paused: dim the value and draw a dashed tail after the last reading. */
  paused?: boolean;
}

export function VitalChartRow({
  name,
  unit,
  values,
  min,
  max,
  normalLo,
  normalHi,
  bandLabel,
  format = String,
  trend,
  range,
  paused = false,
}: VitalChartRowProps) {
  const yOf = (v: number) => (1 - (v - min) / (max - min)) * H;
  const span = paused ? W * PAUSED_SPAN : W;
  const n = values.length;
  const pts = values.map((v, i) => `${(n > 1 ? (i / (n - 1)) * span : span).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const last = n ? values[n - 1] : null;
  const lastY = last == null ? 0 : yOf(last);
  const bandY = yOf(normalHi);
  const bandH = yOf(normalLo) - bandY;

  return (
    <div className={styles.row}>
      <div className={styles.label}>
        <span className={styles.name}>{name}</span>
        <span className={styles.valueLine} style={paused ? { opacity: 0.55 } : undefined}>
          <span className={styles.value}>{last == null ? "—" : format(last)}</span>
          <span className={styles.unit}>{unit}</span>
          {trend ? (
            <span title={trend.word} className={styles.arrow} style={{ color: trend.color }}>
              {trend.arrow}
            </span>
          ) : null}
        </span>
        <span className={styles.range}>
          {range ?? rangeOf(values, format)}
          {trend ? ` · ${trend.word}` : ""}
        </span>
      </div>
      <div className={styles.chart}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.svg} aria-hidden="true">
          <rect x="0" y={bandY.toFixed(1)} width={W} height={bandH.toFixed(1)} fill="var(--news-normal-bg)" />
          <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          <polyline
            points={pts}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {paused && last != null ? (
            <line
              x1={span}
              y1={lastY.toFixed(1)}
              x2={W}
              y2={lastY.toFixed(1)}
              stroke="var(--ink)"
              strokeWidth="2"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {last != null ? (
          <span
            className={styles.dot}
            style={
              paused
                ? { left: `${PAUSED_SPAN * 100}%`, marginLeft: -5, top: `${((lastY / H) * 100).toFixed(1)}%` }
                : { right: -5, top: `${((lastY / H) * 100).toFixed(1)}%` }
            }
          />
        ) : null}
        <span className={styles.band}>{bandLabel}</span>
      </div>
    </div>
  );
}

export interface TimeAxisRowProps {
  /** Evenly spaced labels, e.g. ["Sun 09:00", "13:00", …, "Now"]. */
  labels: ReactNode[];
}

/** The time labels under the charts (same 160 px gutter as the chart rows). */
export function TimeAxisRow({ labels }: TimeAxisRowProps) {
  return (
    <div className={styles.axisRow}>
      <span />
      <div className={styles.axis}>
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

export default VitalChartRow;
