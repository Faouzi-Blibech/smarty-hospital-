// Waitlist (Waitlist.dc.html `WL_ROWS`) and Amira's own appointment (Ward Patient.dc.html).
import type { Appointment, Triage, Urgency } from "@/lib/types";
import { at } from "./time";

interface Row {
  id: string;
  patient_id: string;
  name: string;
  age: string;
  spec: string;
  lang: NonNullable<Appointment["lang"]>;
  text: string;
  u: Urgency;
  conf: number;
  flags: string[];
  ns: number;
  date: string; // Tunis date of the request
  reasons: string[];
}

const WL_ROWS: Row[] = [
  { id: "a-0001", patient_id: "p-0008", name: "Karim Ben Ali", age: "58", spec: "Cardiology", lang: "fr", text: "Douleur thoracique depuis ce matin", u: 5, conf: 92, flags: ["chest_pain"], ns: 8, date: "2026-10-05", reasons: ["Red-flag phrase “douleur thoracique” (chest pain)", "Sudden onset: “depuis ce matin”", "Age 58 — higher cardiac risk band"] },
  { id: "a-0002", patient_id: "p-0009", name: "Hela Mejri", age: "63", spec: "Cardiology", lang: "ar", text: "ألم في الصدر وضيق في التنفس", u: 5, conf: 88, flags: ["chest_pain", "short_of_breath"], ns: 11, date: "2026-10-04", reasons: ["Red-flag phrase “ألم في الصدر” (chest pain)", "Breathlessness mentioned with chest pain", "Age 63 — higher cardiac risk band"] },
  { id: "a-0003", patient_id: "p-0010", name: "Nizar Dridi", age: "66", spec: "Cardiology", lang: "aeb-Latn", text: "waja3 fi sadri ki nimchi, w ne3ya barcha", u: 3, conf: 58, flags: ["exertional_chest_pain"], ns: 14, date: "2026-10-01", reasons: ["“waja3 fi sadri” matched chest pain (Darija, lower certainty)", "“ki nimchi” suggests pain on walking", "Low confidence: informal spelling — review advised"] },
  { id: "a-0004", patient_id: "p-0011", name: "Adam Saidi", age: "4 mo", spec: "Pediatrics", lang: "fr", text: "Bébé de 4 mois avec fièvre à 39.5", u: 4, conf: 85, flags: ["infant_fever"], ns: 9, date: "2026-10-05", reasons: ["Fever ≥ 39 °C", "Infant under 6 months", "No duration given — assumed recent"] },
  { id: "a-0005", patient_id: "p-0012", name: "Mohamed Ayari", age: "45", spec: "Pulmonology", lang: "fr", text: "Toux persistante depuis 3 semaines", u: 3, conf: 74, flags: ["cough_over_3_weeks"], ns: 21, date: "2026-09-28", reasons: ["Cough lasting more than 3 weeks", "No breathing difficulty mentioned"] },
  { id: "a-0006", patient_id: "p-0013", name: "Mounir Gharsalli", age: "70", spec: "Cardiology", lang: "fr", text: "Contrôle tension, traitement stable", u: 2, conf: 83, flags: [], ns: 27, date: "2026-09-15", reasons: ["Follow-up of a stable condition", "No symptoms described"] },
  { id: "a-0007", patient_id: "p-0014", name: "Faouzia Mabrouk", age: "59", spec: "Endocrinology", lang: "fr", text: "Diabète stable, renouvellement", u: 2, conf: 90, flags: [], ns: 34, date: "2026-09-12", reasons: ["Prescription renewal", "Condition described as stable"] },
  { id: "a-0008", patient_id: "p-0015", name: "Aziz Jlassi", age: "17", spec: "General medicine", lang: "fr", text: "Certificat médical pour le sport", u: 1, conf: 96, flags: [], ns: 41, date: "2026-09-20", reasons: ["Administrative request (certificate)", "No symptoms described"] },
];

function fromRow(r: Row): Appointment {
  const triage: Triage = { urgency: r.u, reasons: r.reasons, red_flags: r.flags, source: "model", confidence: r.conf / 100, model_urgency: r.u };
  return {
    id: r.id,
    patient_id: r.patient_id,
    status: "requested",
    urgency_ai: r.u,
    urgency_final: null,
    triage,
    slot_at: null,
    doctor_id: null,
    confirmed_by: null,
    patient_confirmed_at: null,
    no_show_prob: r.ns / 100,
    created_at: at(r.date, "08:30"),
    ai_suggested: triage,
    human_confirmed_by: null,
    patient_name: r.name,
    patient_age: r.age,
    specialty: r.spec,
    referral_text: r.text,
    lang: r.lang,
    doctor_name: null,
    room: null,
    confirmed_by_name: null,
    human_confirmed_by_name: null,
  };
}

export const WAITLIST: Appointment[] = WL_ROWS.map(fromRow);

// The design starts with Nizar Dridi's urgency overridden 3 → 5 by Dr Trabelsi.
const nizar = WAITLIST.find((a) => a.id === "a-0003")!;
nizar.urgency_final = 5;
nizar.human_confirmed_by = "u-0001";
nizar.human_confirmed_by_name = "Dr Trabelsi";

/** Amira's follow-up: Monday 12 Oct · 10:00 with Dr Trabelsi, waiting for her reply. */
const amiraTriage: Triage = { urgency: 2, reasons: ["Follow-up after admission"], red_flags: [], source: "rules", confidence: null, model_urgency: null };
export const PATIENT_APPOINTMENTS: Appointment[] = [
  {
    id: "a-0009",
    patient_id: "p-0001",
    status: "confirmed",
    urgency_ai: 2,
    urgency_final: null,
    triage: amiraTriage,
    slot_at: at("2026-10-12", "10:00"),
    doctor_id: "u-0001",
    confirmed_by: "u-0003",
    patient_confirmed_at: null,
    no_show_prob: 0.12,
    created_at: at("2026-10-02", "12:00"),
    ai_suggested: amiraTriage,
    human_confirmed_by: "u-0003",
    patient_name: "Amira Ben Salah",
    patient_age: "54",
    specialty: "Cardiology",
    referral_text: "Follow-up after admission",
    lang: "fr",
    doctor_name: "Dr Trabelsi",
    room: "Cardiology, Room 4",
    confirmed_by_name: "Mme Gharbi",
    human_confirmed_by_name: "Mme Gharbi",
  },
];
