// API types. They mirror docs/contracts/api.md v1.4 (and data-model.md for doses).
//
// Fields marked `UI extension` are NOT in the contract yet. They are optional,
// the mocks fill them in, and components must fall back gracefully when the real
// API omits them (e.g. show the id, or derive the value). They are listed in the
// Task 1 report as a proposed api.md 1.5 bump.

export type Role = "doctor" | "nurse" | "admin" | "patient";

/** `source` on every AI output (api.md 1.4). */
export type AiSource = "model" | "rules" | "llm";

/** 1 = non-urgent … 5 = very urgent. */
export type Urgency = 1 | 2 | 3 | 4 | 5;

// ── Auth ────────────────────────────────────────────────────────────────────

export interface Me {
  id: string; // u-0001
  name: string;
  email: string;
  role: Role;
  patient_id: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: Pick<Me, "id" | "name" | "role" | "patient_id">;
}

// ── Patients and records ────────────────────────────────────────────────────

export interface PatientSummary {
  id: string; // p-0001
  first_name: string;
  last_name: string;
  age: number;
  ward: string | null; // "Cardiology"
  bed: string | null; // "C-12"
  device_id: string | null; // "bsu-001"
  latest_news2: number | null;
  open_alerts: number;
  /** UI extension: timestamp of the latest vital ("Last vitals · 8 s ago"). */
  last_vital_at?: string | null;
  /** UI extension: is the bedside unit online. */
  device_online?: boolean | null;
}

export interface Patient extends PatientSummary {
  sex: "F" | "M";
  date_of_birth: string; // YYYY-MM-DD
  allergies: string[]; // ["penicillin"]
  history: string;
  attending_doctor_id: string | null;
  admission_id: string | null;
  /** UI extension: "admitted Fri 2 Oct". */
  admitted_at?: string | null;
  /** UI extension: "Severe rash (2019) · includes amoxicillin". */
  allergy_notes?: string | null;
  /** UI extension: display name of the attending doctor. */
  attending_doctor_name?: string | null;
  /** UI extension: display name of the assigned nurse ("Ines"). */
  nurse_name?: string | null;
}

export type VitalSource = "device" | "simulator" | "manual";

export interface Vital {
  ts: string;
  hr: number | null;
  spo2: number | null;
  temp: number | null;
  nurse_id: string | null;
  news2: number | null;
  source: VitalSource;
  /** UI extension: respiratory rate, /min (nurse detail tiles). */
  rr?: number | null;
  /** UI extension: systolic / diastolic blood pressure (nurse detail tiles). */
  bp_sys?: number | null;
  bp_dia?: number | null;
}

export interface Note {
  id: string; // n-0001
  author_id: string;
  author_role: Role;
  text: string;
  created_at: string;
  /** UI extension: "Nurse Ines". */
  author_name?: string;
}

// ── Prescriptions and doses ─────────────────────────────────────────────────

export interface PrescriptionItem {
  med: string; // "Paracetamol 500mg"
  times: string[]; // ["08:00","20:00"], Africa/Tunis wall-clock
  slot: number | null; // carousel slot 1–4, null = reminder only
  days: number;
}

export interface Prescription {
  id: string; // rx-0001
  patient_id: string;
  doctor_id: string;
  items: PrescriptionItem[];
  care_plan: string;
  active: boolean;
  created_at: string;
  schedule_version: number;
  published_to_device: boolean;
  /** UI extension: saved despite an allergy rule conflict (override logged). */
  allergy_override?: boolean;
}

export interface CreatePrescriptionRequest {
  patient_id: string;
  items: PrescriptionItem[];
  care_plan: string;
}

export type DoseStatus = "scheduled" | "dispensed" | "taken" | "missed";

/** One `med_doses` row (data-model.md). No REST path in api.md 1.4 yet. */
export interface Dose {
  id: string; // d-000001
  prescription_id: string;
  patient_id: string;
  scheduled_at: string;
  time_of_day: string; // "08:00"
  meds: string[];
  slot: number | null;
  status: DoseStatus;
  taken_method: "ir" | "button" | null;
  updated_at: string;
  /** UI extension: when it was taken / given. */
  taken_at?: string | null;
  /** UI extension: nurse who gave it by hand (user id) — the design's "Given". */
  given_by?: string | null;
  given_by_name?: string | null;
  /** UI extension: "Give by hand", "Injection", "2 puffs". */
  instructions?: string | null;
}

// ── AI ──────────────────────────────────────────────────────────────────────

export type Severity = "low" | "medium" | "high";

export interface Interaction {
  drugs: [string, string];
  severity: Severity;
  note: string;
}

export interface AiSummary {
  summary: string;
  interactions: Interaction[];
  source: AiSource;
  generated_at: string;
  human_confirmed_by: string | null;
  /** UI extension: "Dr Trabelsi". */
  human_confirmed_by_name?: string | null;
  /** UI extension: when the doctor reviewed it. */
  reviewed_at?: string | null;
  /** UI extension: "Based on: 48 vitals readings · 6 doses · 3 notes". */
  based_on?: { vitals: number; doses: number; notes: number };
}

export type AssistantIntent = "next_dose" | "next_visit" | "my_vitals" | "ask_staff" | "urgent";

export interface AssistantResponse {
  answer: string;
  sources: string[];
  intent: AssistantIntent;
  source: AiSource;
}

// ── Appointments and waitlist ───────────────────────────────────────────────

export type AppointmentStatus = "requested" | "confirmed" | "cancelled" | "done" | "no_show";

export interface Triage {
  urgency: Urgency;
  reasons: string[];
  red_flags: string[]; // snake_case codes, see RED_FLAG_LABELS in lib/labels.ts
  source: AiSource;
  /** From POST /ai/triage; null when no trained model is loaded. 0–1. */
  confidence?: number | null;
  model_urgency?: Urgency | null;
}

export interface Appointment {
  id: string; // a-0001
  patient_id: string;
  status: AppointmentStatus;
  urgency_ai: Urgency;
  urgency_final: Urgency | null;
  triage: Triage;
  slot_at: string | null;
  doctor_id: string | null;
  confirmed_by: string | null;
  patient_confirmed_at: string | null;
  no_show_prob: number | null; // 0–1
  created_at: string;
  /** AI-output convention (data-model.md): same as `triage`. */
  ai_suggested?: Triage;
  /** AI-output convention: who confirmed or overrode the AI urgency. */
  human_confirmed_by?: string | null;
  /** UI extensions: display fields the waitlist and the patient view need. */
  patient_name?: string;
  patient_age?: string; // "58", "4 mo"
  specialty?: string;
  referral_text?: string;
  lang?: "fr" | "ar" | "aeb-Latn" | "en";
  doctor_name?: string | null;
  room?: string | null; // "Cardiology, Room 4"
  confirmed_by_name?: string | null;
  human_confirmed_by_name?: string | null;
}

export interface ConfirmAppointmentRequest {
  slot_at: string;
  doctor_id: string;
  urgency_final?: Urgency;
}

// ── Patient app extras (NOT IN CONTRACT: no api.md 1.4 endpoint yet) ────────

/**
 * A freed slot offered to the patient (n8n W2 backfill). The contract only has the
 * n8n `backfill-accept` callback; the patient web view needs these two shapes.
 */
export interface SlotOffer {
  id: string; // of-0001
  /** The patient's own appointment the offer would replace. */
  appointment_id: string;
  slot_at: string;
  doctor_id: string;
  doctor_name: string;
  room: string;
  status: "open" | "accepted" | "taken";
  expires_at: string;
}

export type HomeCareStepState = "done" | "next" | "pending";

/** The "After discharge" screen: follow-up progress and the medicines to take at home. */
export interface HomeCarePlan {
  patient_id: string;
  discharged_at: string;
  ward_label: string; // "Ward C"
  follow_up: { title: string; steps: { title: string; sub: string; state: HomeCareStepState }[] };
  medicines: { when: string; name: string; sub: string }[];
  desk_phone: string; // "+216 71 000 000"
  emergency_number: string; // "190"
}

// ── Alerts ──────────────────────────────────────────────────────────────────

export type AlertKind = "news2" | "trend" | "call_nurse" | "dose_missed" | "device_offline";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface Alert {
  id: string; // al-0001
  patient_id: string;
  device_id: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  news2: number | null;
  message: string;
  created_at: string;
  acked_by: string | null;
  acked_at: string | null;
  /** UI extensions. */
  bed?: string | null;
  patient_first_name?: string | null;
  acked_by_name?: string | null;
}

// ── Devices and staff ───────────────────────────────────────────────────────

export interface Device {
  id: string; // bsu-001
  online: boolean;
  fw_version: string;
  last_seen: string;
  patient_id: string | null;
  bed: string | null;
  /** UI extension. */
  patient_name?: string | null;
}

/** GET /staff — NOT in api.md 1.4 (admin "Staff" screen). */
export interface StaffMember {
  id: string; // u-0001
  name: string;
  email: string;
  role: Exclude<Role, "patient">;
  ward: string | null; // data-model staff.ward
  scope: string; // "Cardiology · Ward C"
  last_login_at: string | null;
}

// ── Composed views (built client-side from several contract calls) ──────────

/** One bed on the nurse ward board. */
export interface WardBed {
  bed: string;
  patient: PatientSummary | null; // null = empty bed
  device: Device | null;
  latest: Vital | null;
  /** An open `call_nurse` alert exists for this bed. */
  calling: boolean;
}

/** One patient block of the nurse med round (today's doses). */
export interface MedRoundGroup {
  patient: Patient;
  device: Device | null;
  doses: Dose[];
}

// ── WebSocket ───────────────────────────────────────────────────────────────

export type WsFrame =
  | {
      type: "vital";
      data: {
        patient_id: string;
        device_id: string;
        ts: string;
        hr: number | null;
        spo2: number | null;
        temp: number | null;
        news2: number | null;
      };
    }
  | { type: "alert"; data: Alert }
  | { type: "call_nurse"; data: { patient_id: string; device_id: string; bed: string; ts: string } }
  | {
      type: "dose_event";
      data: {
        patient_id: string;
        dose_id: string;
        status: "dispensed" | "taken" | "missed";
        method: "ir" | "button" | null;
        ts: string;
      };
    }
  | { type: "device_status"; data: { device_id: string; online: boolean; ts: string } };

export interface ApiErrorBody {
  detail: string;
  code: string;
}
