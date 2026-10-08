"use client";

// The signed-in user (GET /me), fetched once per tab and shared by every caller.
// Real-mode screens use it for names and actor ids; mock mode keeps the design's people.
import { useEffect, useState } from "react";
import { getMeCached } from "./api";
import type { Me, Role } from "./types";

/** `getMe()` for this tab, or null while loading (or when it failed). `role` picks the mock user. */
export function useMe(role?: Role): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    getMeCached(role).then(
      (m) => alive && setMe(m),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [role]);
  return me;
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
