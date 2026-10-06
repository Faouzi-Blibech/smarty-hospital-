// NEWS2 level colours — exactly the design's `LV` (Ward Doctor/Nurse .dc.html).
// Colours always come with the score and a word (never colour alone).

export type News2Word = "Normal" | "Low" | "High" | "Critical";

export interface News2Level {
  word: News2Word;
  bg: string;
  fg: string;
  edge: string;
}

export const NEWS2_LEVELS: Record<News2Word, News2Level> = {
  Critical: { word: "Critical", bg: "#F7DCDF", fg: "#8A1C2B", edge: "#B4232F" },
  High: { word: "High", bg: "#FBE3D6", fg: "#8F3412", edge: "#D2602A" },
  Low: { word: "Low", bg: "#FAEFD6", fg: "#6E4B00", edge: "#C7900F" },
  Normal: { word: "Normal", bg: "#E1F3E7", fg: "#1B6B3F", edge: "#2E9B5F" },
};

/** score ≥ 7 Critical · ≥ 5 High · ≥ 1 Low · else Normal. */
export function level(score: number | null | undefined): News2Level {
  const s = score ?? 0;
  if (s >= 7) return NEWS2_LEVELS.Critical;
  if (s >= 5) return NEWS2_LEVELS.High;
  if (s >= 1) return NEWS2_LEVELS.Low;
  return NEWS2_LEVELS.Normal;
}

/** The pulse animation the design applies at NEWS2 ≥ 7. */
export const PULSE = "wardPulse 2.4s ease-in-out infinite";

export function isCritical(score: number | null | undefined): boolean {
  return (score ?? 0) >= 7;
}
