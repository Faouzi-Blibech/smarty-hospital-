// Mock fixtures entry point. All data is synthetic, copied from the Claude Design mockups.
// `api.ts` is the only consumer: components never import mocks directly
// (except `NAV_COUNTS`, the static sidebar counts).
import type { Alert, AiSummary, Appointment, Device, Dose, Note, Patient, Prescription, StaffMember, Vital } from "@/lib/types";
import { ALERTS } from "./alerts";
import { PATIENT_APPOINTMENTS, WAITLIST } from "./appointments";
import { DOSES, NOTES, PRESCRIPTIONS, SUMMARIES } from "./clinical";
import { BOARD_BED_ORDER, DEVICES, PATIENTS, STAFF } from "./people";
import { VITALS } from "./vitals";

export { mockAssistant } from "./assistant";
export { BOARD_BED_ORDER, USERS, userName } from "./people";
export { nowIso } from "./time";

/** Sidebar counts, verbatim from Sidebar.dc.html's sample data. */
export const NAV_COUNTS = {
  doctor: { patients: "6", requests: "4" },
  nurse: { board: "", alerts: "4", meds: "3", patients: "8" },
  admin: { dashboard: "", waitlist: "8", devices: "", staff: "" },
} as const;

export interface MockStore {
  patients: Patient[];
  vitals: Record<string, Vital[]>;
  prescriptions: Prescription[];
  doses: Dose[];
  notes: Record<string, Note[]>;
  summaries: Record<string, { model: AiSummary; rules: AiSummary }>;
  appointments: Appointment[];
  alerts: Alert[];
  devices: Device[];
  staff: StaffMember[];
  boardBedOrder: string[];
  seq: { rx: number; dose: number; note: number };
}

/** A fresh, deep-copied, mutable store. Mutations in api.ts write here. */
export function createStore(): MockStore {
  return structuredClone({
    patients: PATIENTS,
    vitals: VITALS,
    prescriptions: PRESCRIPTIONS,
    doses: DOSES,
    notes: NOTES,
    summaries: SUMMARIES,
    appointments: [...WAITLIST, ...PATIENT_APPOINTMENTS],
    alerts: ALERTS,
    devices: DEVICES,
    staff: STAFF,
    boardBedOrder: BOARD_BED_ORDER,
    seq: { rx: PRESCRIPTIONS.length, dose: DOSES.length, note: Object.values(NOTES).flat().length },
  });
}

