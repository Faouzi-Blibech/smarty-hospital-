"use client";

// Real-mode ward names for the admin screens. Devices carry no ward, so the ward comes
// from the patients' `ward` (GET /patients). Mock mode keeps the design's "Ward C".
import { useEffect, useState } from "react";
import { getMyPatients } from "@/lib/api";
import { USE_MOCKS } from "@/lib/time";

/** The design's ward label (mock mode). */
export const MOCK_WARD = "Ward C";

/** patient id → ward ("Cardiology"). Empty in mock mode, while loading, or if the list fails. */
export function usePatientWards(): Record<string, string> {
  const [wards, setWards] = useState<Record<string, string>>({});
  useEffect(() => {
    if (USE_MOCKS) return;
    let alive = true;
    getMyPatients()
      .then((list) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const p of list) if (p.ward) map[p.id] = p.ward;
        setWards(map);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return wards;
}

/** The distinct wards of these patients, "Cardiology · Internal Medicine", or null when none is known. */
export function wardsOf(patientIds: (string | null | undefined)[], wards: Record<string, string>): string | null {
  if (USE_MOCKS) return MOCK_WARD;
  const names = [...new Set(patientIds.map((id) => (id ? wards[id] : undefined)).filter((w): w is string => !!w))];
  return names.length ? names.join(" · ") : null;
}
