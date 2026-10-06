"use client";

// Patient app helpers: data loading, plain-word formatting and the offline flag.
// The patient sees plain words only: no NEWS2, no AI urgency, no jargon.
import { useCallback, useEffect, useState } from "react";
import { getMe } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { now, tunisTime, USE_MOCKS } from "@/lib/time";
import type { Dose } from "@/lib/types";

// ── Loading ─────────────────────────────────────────────────────────────────

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** When the last successful load finished (for "Showing your schedule from 09:10"). */
  loadedAt: Date | null;
  retry: () => void;
  setData: (d: T) => void;
}

/** Runs `fn` on mount (and on `retry()` or when `key` changes). */
export function useLoad<T>(fn: () => Promise<T>, key = ""): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean; loadedAt: Date | null }>({
    data: null,
    error: null,
    loading: true,
    loadedAt: null,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false, loadedAt: new Date() }),
      (error: unknown) => alive && setState((s) => ({ ...s, data: null, error, loading: false })),
    );
    return () => {
      alive = false;
    };
    // `fn` is recreated each render; `key` and `attempt` are the reload triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), []);
  return { ...state, retry, setData };
}

/** The signed-in patient's id (mock: Amira, p-0001). */
export async function myPatientId(): Promise<string> {
  const me = await getMe("patient");
  if (!me.patient_id) throw new Error("Not a patient account");
  return me.patient_id;
}

// ── Offline ─────────────────────────────────────────────────────────────────

/** True when the browser is offline or the demo flag `?live=0` is set. */
export function useOffline(): boolean {
  const { live } = useDemoFlags();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return !live || !online;
}

/** "09:10": when the shown data was loaded (mock: the design's two minutes before the demo clock). */
export function offlineSince(loadedAt: Date | null): string {
  const d = USE_MOCKS || !loadedAt ? new Date(now().getTime() - 120_000) : loadedAt;
  return tunisTime(d.toISOString());
}

// ── Dates in plain words (Africa/Tunis) ─────────────────────────────────────

const TZ = "Africa/Tunis";
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...o });
const weekdayF = fmt({ weekday: "long" });
const dayF = fmt({ day: "numeric" });
const monShortF = fmt({ month: "short" });
const monLongF = fmt({ month: "long" });

/** "Monday" */
export const weekday = (iso: string) => weekdayF.format(new Date(iso));
/** "Monday 5 Oct" */
export const longDay = (iso: string) => `${weekday(iso)} ${dayF.format(new Date(iso))} ${monShortF.format(new Date(iso))}`;
/** "12 October" */
export const dayMonthLong = (iso: string) => `${dayF.format(new Date(iso))} ${monLongF.format(new Date(iso))}`;

/** Whole days between two instants' Tunis dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const d = (iso: string) => Date.parse(new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 10));
  return Math.round((d(b) - d(a)) / 86_400_000);
}

/** "Good morning" / "Good afternoon" / "Good evening" by the Tunis hour. */
export function greeting(ref: Date = now()): string {
  const h = Number(tunisTime(ref.toISOString()).slice(0, 2));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "Bed C-12 · Ward C" — the ward letter is the bed prefix. */
export function bedLine(bed: string | null): string | null {
  if (!bed) return null;
  const letter = bed.split("-")[0];
  return `Bed ${bed} · Ward ${letter}`;
}

/** "Amoxicillin 1g" → "Amoxicillin" (the design's missed-dose line drops the strength). */
export const drugWord = (name: string) => name.replace(/\s+\d.*$/, "");

// ── Medicines and vitals in plain words ─────────────────────────────────────

export type MedState = "taken" | "upcoming" | "missed";

export function medState(d: Dose): MedState {
  return d.status === "taken" ? "taken" : d.status === "missed" ? "missed" : "upcoming";
}

export const MED_LABEL: Record<MedState, string> = { taken: "✓ Taken", upcoming: "Upcoming", missed: "Missed" };

/** "Given by your nurse" for by-hand doses (no slot or a nurse gave it), else the bedside box. */
export function medSource(d: Dose): string {
  return d.given_by || d.slot == null ? "Given by your nurse" : "From your bedside box";
}

/** Usual ranges (the NEWS2 zero-score bands), shown only as "Normal" / "Needs attention". */
export function vitalWord(kind: "hr" | "spo2" | "temp", v: number): "Normal" | "Needs attention" {
  const ok = kind === "hr" ? v >= 51 && v <= 90 : kind === "spo2" ? v >= 96 : v >= 36.1 && v <= 38.0;
  return ok ? "Normal" : "Needs attention";
}

/**
 * "Call nurse" fallback. Nothing in the prototype pages staff (no web endpoint; the bedside unit
 * has no button, buzzer or sensors), so the hint must not claim anyone was told.
 */
export const CALL_NURSE_HINT = "Ask any member of staff, or tell your nurse at the next round.";
