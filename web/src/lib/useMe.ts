"use client";

// The signed-in user (GET /me), fetched once per tab and shared by every caller.
// Real-mode screens use it for names and actor ids; mock mode keeps the design's people.
import { useEffect, useState } from "react";
import { getMeCached } from "./api";
import type { Me, Role } from "./types";

/** `getMe()` for this tab plus whether it failed; `me` is null while loading or after a failure. */
export function useMeState(role?: Role): { me: Me | null; failed: boolean } {
  const [state, setState] = useState<{ me: Me | null; failed: boolean }>({ me: null, failed: false });
  useEffect(() => {
    let alive = true;
    getMeCached(role).then(
      (me) => alive && setState({ me, failed: false }),
      () => alive && setState({ me: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [role]);
  return state;
}

/** `getMe()` for this tab, or null while loading (or when it failed). `role` picks the mock user. */
export function useMe(role?: Role): Me | null {
  return useMeState(role).me;
}

/** "DT" for "Dr Trabelsi", "HM" for "Hela Mejri". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default useMe;
