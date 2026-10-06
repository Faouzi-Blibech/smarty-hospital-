// Fixture time helpers. The demo clock is Mon 5 Oct 2026 09:12 Africa/Tunis (08:12Z).
import { DEMO_NOW } from "@/lib/time";

export const NOW_MS = Date.parse(DEMO_NOW);
export const TODAY = "2026-10-05";
export const SUN = "2026-10-04";

/** Tunis wall-clock (UTC+1, no DST) → ISO UTC. at("2026-10-05", "09:12") → "2026-10-05T08:12:00Z". */
export function at(date: string, hhmm: string): string {
  return new Date(Date.parse(`${date}T${hhmm}:00+01:00`)).toISOString().replace(".000Z", "Z");
}

/** ISO for `seconds` before the demo clock. */
export function secondsAgo(seconds: number): string {
  return new Date(NOW_MS - seconds * 1000).toISOString().replace(".000Z", "Z");
}

export function nowIso(): string {
  return DEMO_NOW;
}
