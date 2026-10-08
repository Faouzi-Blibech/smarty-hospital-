// Demo clock and Africa/Tunis time formatting. Server-safe (no hooks): import
// from server or client components alike.

/** Mocks are on unless NEXT_PUBLIC_USE_MOCKS is explicitly set to something other than "1". */
export const USE_MOCKS = (process.env.NEXT_PUBLIC_USE_MOCKS ?? "1") === "1";

/** The design's sample time: Mon 5 Oct 2026, 09:12 Africa/Tunis (UTC+1). */
export const DEMO_NOW = "2026-10-05T08:12:00Z";

/** "Now" for the UI: the frozen demo time in mock mode, the real clock otherwise. */
export function now(): Date {
  return USE_MOCKS ? new Date(DEMO_NOW) : new Date();
}

// ── Time formatting (devices and UI show Africa/Tunis) ──────────────────────

const TZ = "Africa/Tunis";

const hm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const hms = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const dayParts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "09:12" */
export function tunisTime(iso: string): string {
  return hm.format(new Date(iso));
}

/** "09:11:48" */
export function tunisTimeSeconds(iso: string): string {
  return hms.format(new Date(iso));
}

/** "Mon 5 Oct" */
export function tunisDay(iso: string): string {
  const p = dayParts.formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "2026-10-05" (the Tunis calendar date). */
export function tunisDate(iso: string): string {
  return ymd.format(new Date(iso));
}

/** "Today" when the date is today, else the short weekday ("Sun"). */
export function dayLabel(iso: string, ref: Date = now()): string {
  if (tunisDate(iso) === tunisDate(ref.toISOString())) return "Today";
  return tunisDay(iso).split(" ")[0];
}

/** Whole calendar days from `iso` to `ref` (Tunis dates). */
export function daysSince(iso: string, ref: Date = now()): number {
  const a = Date.parse(`${tunisDate(iso)}T00:00:00Z`);
  const b = Date.parse(`${tunisDate(ref.toISOString())}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "Good morning" before 12:00, "Good afternoon" before 18:00, else "Good evening" (Tunis time). */
export function greeting(ref: Date = now()): string {
  const h = Number(tunisTime(ref.toISOString()).slice(0, 2));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "8 s ago", "6 min ago", "2 h ago". */
export function ago(iso: string, ref: Date = now()): string {
  const s = Math.max(0, Math.round((ref.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** Time of the last reading shown while live data is paused (design: 09:11:48). */
export const pausedAt = (): string => tunisTimeSeconds(new Date(now().getTime() - 12_000).toISOString());
