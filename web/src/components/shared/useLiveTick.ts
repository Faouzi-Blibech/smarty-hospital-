"use client";

// The design's live tick: every second "updated N s ago" cycles 1…4, and each wrap
// counts a new reading (`reading`), which drives the simulated jitter on the last value.
import { useEffect, useState } from "react";

/** Simulated jitter on the latest reading, per reading (design: [0, 1, -1, 2, 1]). */
export const LIVE_JITTER = [0, 1, -1, 2, 1];

export function useLiveTick(live: boolean): { sec: number; reading: number } {
  const [t, setT] = useState({ sec: 2, reading: 0 });
  useEffect(() => {
    if (!live) return;
    const id = setInterval(
      () => setT((s) => (s.sec >= 4 ? { sec: 1, reading: s.reading + 1 } : { sec: s.sec + 1, reading: s.reading })),
      1000,
    );
    return () => clearInterval(id);
  }, [live]);
  return t;
}

export default useLiveTick;
