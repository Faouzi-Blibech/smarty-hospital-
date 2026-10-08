// UI-only labels and colours derived from API values (not stored in fixtures).
import type { AiSource, Urgency } from "./types";

/** Design: "AI suggestion · Model" / "AI suggestion · Rules fallback". */
export function aiSourceLabel(source: AiSource): "Model" | "Rules fallback" {
  return source === "rules" ? "Rules fallback" : "Model";
}

export interface UrgencyLevel {
  word: "Very urgent" | "Urgent" | "Soon" | "Routine" | "Non-urgent";
  bg: string;
  fg: string;
  edge: string;
}

/** The waitlist's `WL_U` (Waitlist.dc.html). */
export const URGENCY: Record<Urgency, UrgencyLevel> = {
  5: { word: "Very urgent", bg: "#F7DCDF", fg: "#8A1C2B", edge: "#B4232F" },
  4: { word: "Urgent", bg: "#FBE3D6", fg: "#8F3412", edge: "#D2602A" },
  3: { word: "Soon", bg: "#FAEFD6", fg: "#6E4B00", edge: "#C7900F" },
  2: { word: "Routine", bg: "#E1F3E7", fg: "#1B6B3F", edge: "#0B8A96" },
  1: { word: "Non-urgent", bg: "#E8EEF0", fg: "#33454F", edge: "#8597A1" },
};

/** Admin dashboard bar colours (`UC` in Ward Admin.dc.html). */
export const URGENCY_BAR: Record<Urgency, string> = {
  5: "#B4232F",
  4: "#D2602A",
  3: "#C7900F",
  2: "#0B8A96",
  1: "#A4B3BB",
};

/** Display labels for triage `red_flags` codes. */
export const RED_FLAG_LABELS: Record<string, string> = {
  chest_pain: "Chest pain",
  short_of_breath: "Short of breath",
  exertional_chest_pain: "Exertional chest pain",
  infant_fever: "Infant fever",
  cough_over_3_weeks: "Cough > 3 weeks",
};

export function redFlagLabel(code: string): string {
  return RED_FLAG_LABELS[code] ?? code.replace(/_/g, " ");
}

/** Waitlist language column: "FR", "AR", "Darija". */
export const LANG_LABELS: Record<string, string> = {
  fr: "FR",
  ar: "AR",
  "aeb-Latn": "Darija",
  en: "EN",
};

/** Design: no-show ≥ 30 % "likely to miss", ≥ 15 % "medium", else "low". */
export function noShowWord(prob: number | null | undefined): string {
  const pct = Math.round((prob ?? 0) * 100);
  return pct >= 30 ? "likely to miss" : pct >= 15 ? "medium" : "low";
}

export interface ClinicDoctor {
  id: string;
  name: string;
  specialty: string;
}

/**
 * Mock mode only: which doctor a waitlist row books, by the request's specialty (ids from the
 * mock STAFF fixture; u-0005 is the patient login in the backend seed, so these use u-0010+).
 * Real mode resolves the doctor from GET /me or GET /staff (components/Waitlist.tsx).
 */
export const SPECIALTY_DOCTORS: Record<string, ClinicDoctor> = {
  Cardiology: { id: "u-0001", name: "Dr Trabelsi", specialty: "Cardiology" },
  Pediatrics: { id: "u-0010", name: "Dr Ben Romdhane", specialty: "Pediatrics" },
  Pulmonology: { id: "u-0011", name: "Dr Karoui", specialty: "Pulmonology" },
};

/** The doctor for a specialty; falls back to the doctor with `fallbackId`, then Cardiology. */
export function doctorForSpecialty(specialty: string | null | undefined, fallbackId?: string): ClinicDoctor {
  const bySpecialty = specialty ? SPECIALTY_DOCTORS[specialty] : undefined;
  if (bySpecialty) return bySpecialty;
  return Object.values(SPECIALTY_DOCTORS).find((d) => d.id === fallbackId) ?? SPECIALTY_DOCTORS.Cardiology;
}
