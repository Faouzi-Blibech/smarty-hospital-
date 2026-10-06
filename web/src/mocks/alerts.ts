// Ward alerts (Ward Nurse.dc.html `ALERTS`), newest first.
import type { Alert } from "@/lib/types";
import { at, TODAY } from "./time";

const base = { acked_by: null, acked_at: null, acked_by_name: null } as const;

export const ALERTS: Alert[] = [
  { ...base, id: "al-0001", patient_id: "p-0001", device_id: "bsu-001", kind: "call_nurse", severity: "high", news2: null, message: "Call request from the bedside", created_at: at(TODAY, "09:12"), bed: "C-12", patient_first_name: "Amira" },
  { ...base, id: "al-0002", patient_id: "p-0002", device_id: "bsu-004", kind: "news2", severity: "critical", news2: 7, message: "SpO2 88%, HR 130 — NEWS2 7", created_at: at(TODAY, "09:11"), bed: "C-16", patient_first_name: "Omar" },
  { ...base, id: "al-0003", patient_id: "p-0006", device_id: "bsu-002", kind: "device_offline", severity: "low", news2: null, message: "bsu-002 last seen 09:06 — check power and Wi-Fi", created_at: at(TODAY, "09:06"), bed: "C-14", patient_first_name: "Sami" },
  { ...base, id: "al-0004", patient_id: "p-0001", device_id: "bsu-001", kind: "trend", severity: "high", news2: 5, message: "SpO2 falling about 0.4%/h since 03:00", created_at: at(TODAY, "09:04"), bed: "C-12", patient_first_name: "Amira" },
  {
    id: "al-0006", patient_id: "p-0003", device_id: "bsu-006", kind: "news2", severity: "medium", news2: 3, message: "NEWS2 rose to 3 (RR 21)", created_at: at(TODAY, "08:52"), bed: "C-18", patient_first_name: "Hédi",
    acked_by: "u-0004", acked_at: at(TODAY, "08:55"), acked_by_name: "Nurse Sami",
  },
  { ...base, id: "al-0005", patient_id: "p-0002", device_id: "bsu-004", kind: "dose_missed", severity: "medium", news2: null, message: "Bisoprolol 2.5mg (08:00) not marked taken", created_at: at(TODAY, "08:30"), bed: "C-16", patient_first_name: "Omar" },
];
