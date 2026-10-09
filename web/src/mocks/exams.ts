// Synthetic exam orders for the single-visit demo (spec 2026-10-09). The ids match the waitlist fixtures.
import type { CatalogueItem, ExamOrder } from "@/lib/types";

export const EXAM_CATALOGUE: CatalogueItem[] = [
  { code: "ecg", label: "ECG (12-lead)", department: "Cardiology" },
  { code: "echo", label: "Echocardiography", department: "Cardiology" },
  { code: "troponin", label: "Troponin", department: "Laboratory" },
  { code: "cbc", label: "Complete blood count", department: "Laboratory" },
  { code: "crp", label: "CRP", department: "Laboratory" },
  { code: "chest_xray", label: "Chest X-ray", department: "Imaging" },
];

const rules = (bundle: string) => ({ source: "rules" as const, bundles: [bundle], reason: `Suggested by the exam rules for: ${bundle}` });

export function examFixtures(firstAppointmentId: string, patientId: string, patientName: string): ExamOrder[] {
  const base = { patient_id: patientId, appointment_id: firstAppointmentId, ordered_at: null, done_at: null,
    created_at: "2026-10-09T07:40:00Z", patient_name: patientName, human_confirmed_by: null, results: [] };
  return [
    { ...base, id: "ex-0001", code: "ecg", label: "ECG (12-lead)", department: "Cardiology", status: "suggested", ai_suggested: rules("chest_pain") },
    { ...base, id: "ex-0002", code: "troponin", label: "Troponin", department: "Laboratory", status: "suggested", ai_suggested: rules("chest_pain") },
    { ...base, id: "ex-0003", code: "chest_xray", label: "Chest X-ray", department: "Imaging", status: "suggested", ai_suggested: rules("chest_pain") },
  ];
}
