// Nurse view helpers: NEWS2 sub-scores, alert labels, dose statuses and sparklines.
// UI-derived values only (computed from the contract records, never stored in fixtures).
import { tunisTime } from "@/lib/time";
import type { Alert, AlertKind, Dose, Prescription, WardBed } from "@/lib/types";

/** The signed-in nurse in the demo (Nurse Ines). The real API takes the actor from the JWT. */
export const NURSE_ID = "u-0002";
export const NURSE_NAME = "Nurse Ines";
/** The ward the nurse is on (design: "Ward C"). */
export const WARD_LABEL = "Ward C";

// ── NEWS2 component scores (RCP NEWS2, SpO2 scale 1) ─────────────────────────

export function hrPoints(v: number): number {
  if (v <= 40) return 3;
  if (v <= 50) return 1;
  if (v <= 90) return 0;
  if (v <= 110) return 1;
  if (v <= 130) return 2;
  return 3;
}

export function spo2Points(v: number): number {
  if (v <= 91) return 3;
  if (v <= 93) return 2;
  if (v <= 95) return 1;
  return 0;
}

export function tempPoints(v: number): number {
  if (v <= 35.0) return 3;
  if (v <= 36.0) return 1;
  if (v <= 38.0) return 0;
  if (v <= 39.0) return 1;
  return 2;
}

export function rrPoints(v: number): number {
  if (v <= 8) return 3;
  if (v <= 11) return 1;
  if (v <= 20) return 0;
  if (v <= 24) return 2;
  return 3;
}

export function sysPoints(v: number): number {
  if (v <= 90) return 3;
  if (v <= 100) return 2;
  if (v <= 110) return 1;
  if (v <= 219) return 0;
  return 3;
}

// ── Ward board ──────────────────────────────────────────────────────────────

const rank = (b: WardBed) => (!b.patient ? 2 : b.device && !b.device.online ? 1 : 0);

/**
 * The design's board order: highest NEWS2 first, offline units after online ones
 * at the same score, empty beds last. Applied explicitly so mock and real mode match.
 */
export function boardOrder(beds: WardBed[]): WardBed[] {
  return beds
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      if (!x.b.patient !== !y.b.patient) return x.b.patient ? -1 : 1;
      const n = (y.b.patient?.latest_news2 ?? -1) - (x.b.patient?.latest_news2 ?? -1);
      return n || rank(x.b) - rank(y.b) || x.i - y.i;
    })
    .map(({ b }) => b);
}

/** Bed number order for the patient list ("C-11", "C-12", …). */
export const byBed = (a: WardBed, b: WardBed) => a.bed.localeCompare(b.bed, undefined, { numeric: true });

// ── Alerts ──────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<AlertKind, string> = {
  call_nurse: "Call nurse",
  news2: "NEWS2",
  device_offline: "Device offline",
  trend: "Trend",
  dose_missed: "Missed dose",
};

/** Severity pill: word and [bg, fg] (design `SEV`). A call-nurse alert shows "Call". */
export function severityPill(a: Alert): { word: string; bg: string; fg: string } {
  if (a.kind === "call_nurse") return { word: "Call", bg: "var(--danger)", fg: "var(--paper)" };
  switch (a.severity) {
    case "critical":
      return { word: "Critical", bg: "var(--news-crit-edge)", fg: "var(--paper)" };
    case "high":
      return { word: "High", bg: "var(--news-high-bg)", fg: "var(--news-high-fg)" };
    case "medium":
      return { word: "Medium", bg: "var(--news-low-bg)", fg: "var(--news-low-fg)" };
    default:
      return { word: "Low", bg: "var(--disabled)", fg: "var(--text)" };
  }
}

/** Open alerts first, then newest first (design sort). */
export function alertOrder(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => Number(!!a.acked_by) - Number(!!b.acked_by) || b.created_at.localeCompare(a.created_at));
}

// ── Doses (med round and nurse patient detail) ─────────────────────────────

export type NurseDoseStatus = "Missed" | "Given" | "Taken" | "Dispensed" | "Due" | "Scheduled";

/** Status pill colours (design `ST`): [bg, fg, border]. */
export const DOSE_PILL: Record<NurseDoseStatus, [string, string, string]> = {
  Missed: ["var(--news-crit-bg)", "var(--news-crit-fg)", "var(--missed-line)"],
  Given: ["var(--news-normal-bg)", "var(--news-normal-fg)", "var(--given-line)"],
  Taken: ["var(--news-normal-bg)", "var(--news-normal-fg)", "var(--given-line)"],
  Dispensed: ["var(--news-low-bg)", "var(--news-low-fg)", "var(--dispensed-line)"],
  Due: ["var(--paper)", "var(--ink)", "var(--ink)"],
  Scheduled: ["var(--paper)", "var(--muted)", "var(--line)"],
};

const DUE_WINDOW_MS = 60 * 60_000;

/** Nurse status: "Given" = taken by hand, "Due" = scheduled within the next hour (or overdue, not yet missed). */
export function nurseStatus(d: Dose, ref: Date): NurseDoseStatus {
  switch (d.status) {
    case "taken":
      return d.given_by ? "Given" : "Taken";
    case "missed":
      return "Missed";
    case "dispensed":
      return "Dispensed";
    default:
      return Date.parse(d.scheduled_at) - ref.getTime() <= DUE_WINDOW_MS ? "Due" : "Scheduled";
  }
}

export interface DoseView {
  id: string;
  time: string;
  med: string;
  sub: string;
  subAlert: boolean;
  slot: string;
  status: NurseDoseStatus;
  statusText: string;
  /** The "Mark given" button shows. */
  canGive: boolean;
  /** Text in the action column when there is no button. */
  by: string;
}

export interface DoseContext {
  ref: Date;
  /** Prescriptions by id (for the allergy override note). */
  prescriptions?: Map<string, Prescription>;
  /** Alerts for the "· alert sent 08:30" note on missed doses. */
  alerts?: Alert[];
}

function missedAlert(d: Dose, alerts: Alert[] = []): Alert | undefined {
  const drug = d.meds[0]?.split(" ")[0] ?? "";
  return alerts.find((a) => a.kind === "dose_missed" && a.patient_id === d.patient_id && !!drug && a.message.startsWith(drug));
}

/** Subline under the drug name, from the dose as it was scheduled (kept after "Mark given"). */
function subOf(d: Dose, ctx: DoseContext): { sub: string; subAlert: boolean } {
  switch (d.status) {
    case "missed": {
      const alert = missedAlert(d, ctx.alerts);
      const base = d.slot != null ? "Not confirmed at bedside" : "Not given by hand";
      return { sub: alert ? `${base} · alert sent ${tunisTime(alert.created_at)}` : base, subAlert: false };
    }
    case "dispensed":
      return { sub: `Dispensed ${tunisTime(d.updated_at)} · waiting for confirmation`, subAlert: false };
    case "taken":
      if (d.given_by) return { sub: d.instructions ?? "Give by hand", subAlert: false };
      return { sub: `Dispensed ${tunisTime(d.scheduled_at)}`, subAlert: false };
    default: {
      if (ctx.prescriptions?.get(d.prescription_id)?.allergy_override)
        return { sub: "Allergy conflict · doctor override logged", subAlert: true };
      return { sub: d.instructions ?? (d.slot != null ? "Dispense from unit" : "Give by hand"), subAlert: false };
    }
  }
}

/**
 * One dose row. `dose` is the current record; `original` (when the nurse just
 * marked it given) keeps the subline as it was, as the design does.
 */
export function doseView(dose: Dose, ctx: DoseContext, original: Dose = dose): DoseView {
  const status = nurseStatus(dose, ctx.ref);
  const done = status === "Given" || status === "Taken";
  const mins = Math.ceil((Date.parse(dose.scheduled_at) - ctx.ref.getTime()) / 60_000);
  const statusText = status === "Due" ? (mins > 0 ? `Due in ${mins} min` : "Due now") : status;
  const at = dose.taken_at ? tunisTime(dose.taken_at) : "";
  const by =
    status === "Given"
      ? `${dose.given_by_name ?? dose.given_by} · ${at}`
      : status === "Taken"
        ? `Confirmed at bedside ${at}`.trim()
        : "Not yet due";
  return {
    id: dose.id,
    time: tunisTime(dose.scheduled_at),
    med: dose.meds.join(" + "),
    ...subOf(original, ctx),
    slot: dose.slot != null ? `Slot ${dose.slot}` : "Reminder only",
    status,
    statusText,
    canGive: !done && status !== "Scheduled",
    by,
  };
}

/** "penicillin" → "Allergy · Penicillin"; none → "No known allergies". */
export function allergyLabel(allergies: string[]): string {
  if (!allergies.length) return "No known allergies";
  const s = allergies.join(", ");
  return `Allergy · ${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

// ── Sparkline (design `spark`, viewBox 0 0 100 28) ──────────────────────────

export function spark(values: number[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return "0,14 100,14";
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  return values
    .map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(26 - ((v - mn) / (mx - mn || 1)) * 24).toFixed(1)}`)
    .join(" ");
}
