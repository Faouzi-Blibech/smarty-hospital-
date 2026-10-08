// Pure helpers that bucket a vitals series for the charts. Real vitals arrive every few
// seconds (the seed has 15-minute data), so the charts draw one point per hour and one
// NEWS2 dot per 2 hours. Buckets end at `now`: bucket k covers (end - width, end].
// An empty bucket is null; callers draw a gap, never an interpolated value.
import type { Vital } from "./types";

const HOUR_MS = 3_600_000;

export type VitalKey = "hr" | "spo2" | "temp";

/** Values of `vitals` grouped into `count` right-closed windows of `widthMs` ending at `now`. */
function buckets(vitals: Vital[], pick: (v: Vital) => number | null | undefined, count: number, widthMs: number, now: Date): number[][] {
  const end = now.getTime();
  const out: number[][] = Array.from({ length: count }, () => []);
  for (const v of vitals) {
    const x = pick(v);
    if (x == null) continue;
    const t = Date.parse(v.ts);
    if (Number.isNaN(t)) continue;
    // A reading exactly `width` before `end` belongs to the previous bucket (right-closed windows).
    // A reading slightly ahead of this clock (device clock skew) counts as the current bucket.
    const k = count - 1 - Math.floor(Math.max(0, end - t) / widthMs);
    if (k >= 0 && k < count) out[k].push(x);
  }
  return out;
}

/**
 * One mean per hour over the last `hours` hours, plus the current hour: `hours + 1` points,
 * oldest first, null where an hour has no reading. Bucket 0 ends `hours` hours before `now`.
 */
export function hourlyMeans(vitals: Vital[], key: VitalKey, hours = 24, now: Date = new Date()): (number | null)[] {
  return buckets(vitals, (v) => v[key], hours + 1, HOUR_MS, now).map((xs) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
  );
}

/** 13 two-hour windows ending at `now` (the last 24 h plus one): the max NEWS2 of each, null where empty. */
export function news2Every2h(vitals: Vital[], now: Date = new Date()): (number | null)[] {
  return buckets(vitals, (v) => v.news2, 13, 2 * HOUR_MS, now).map((xs) => (xs.length ? Math.max(...xs) : null));
}
