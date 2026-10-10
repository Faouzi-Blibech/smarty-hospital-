"use client";

// The health events around today for `role` (two months back, ~13 months ahead).
// Shared by the calendar page, the patient tab and the upcoming banner.
import { useCallback, useEffect, useState } from "react";
import { getHealthEvents } from "@/lib/api";
import { addDays, todayIso } from "@/lib/healthCalendar";
import type { HealthEvent, Role } from "@/lib/types";

export function useHealthEvents(role: Role): { events: HealthEvent[] | null; failed: boolean; reload: () => void } {
  const [state, setState] = useState<{ events: HealthEvent[] | null; failed: boolean }>({ events: null, failed: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const today = todayIso();
    getHealthEvents({ role, from: addDays(today, -60), to: addDays(today, 400) }).then(
      (events) => alive && setState({ events, failed: false }),
      () => alive && setState((s) => ({ events: s.events, failed: true })),
    );
    return () => {
      alive = false;
    };
  }, [role, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { events: state.events, failed: state.failed, reload };
}

export default useHealthEvents;
