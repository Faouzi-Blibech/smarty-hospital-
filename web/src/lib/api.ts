// The single data layer. Components read and write through these functions only.
//
// Mock mode (NEXT_PUBLIC_USE_MOCKS=1, the default when unset): every call resolves
// from an in-memory copy of `web/src/mocks` after 150 ms. Mutations write to that
// store, so a later read reflects them (until a full page reload).
// Real mode: calls NEXT_PUBLIC_API_URL with the paths of docs/contracts/api.md.
// Paths marked NOT IN CONTRACT have no api.md 1.4 endpoint yet (see the Task 1 report).
import { createStore, mockAssistant, USERS, userName, type MockStore } from "@/mocks";
import { now, tunisDate, USE_MOCKS } from "./time";
import type {
  Alert,
  AiSummary,
  Appointment,
  AssistantResponse,
  ConfirmAppointmentRequest,
  CreatePrescriptionRequest,
  Device,
  Dose,
  Me,
  MedRoundGroup,
  Note,
  Patient,
  PatientSummary,
  Prescription,
  Role,
  StaffMember,
  Urgency,
  Vital,
  WardBed,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const MOCK_DELAY_MS = 150;
const TOKEN_KEY = "ward_token";
const DEFAULT_WARD = "Cardiology";

export { USE_MOCKS };

/** Who performs a mutation. Mock mode only — the real API takes the actor from the JWT. */
export interface ActorOpts {
  by?: string; // user id, e.g. "u-0001"
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Transport ───────────────────────────────────────────────────────────────

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string; code?: string };
    throw new ApiError(res.status, err.code ?? "http_error", err.detail ?? res.statusText);
  }
  return (await res.json()) as T;
}

let store: MockStore | null = null;
const db = (): MockStore => (store ??= createStore());

/** Restore the fixtures (drops every mock mutation). */
export function resetMockStore(): void {
  store = createStore();
}

/** Runs `fn` against the mock store after the mock delay; returns a deep copy. */
function mock<T>(fn: (s: MockStore) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(structuredClone(fn(db())));
      } catch (e) {
        reject(e);
      }
    }, MOCK_DELAY_MS);
  });
}

function notFound(what: string): never {
  throw new ApiError(404, "not_found", `${what} not found`);
}

const iso = (d: Date) => d.toISOString().replace(".000Z", "Z");
const byNews = (a: { latest_news2: number | null }, b: { latest_news2: number | null }) =>
  (b.latest_news2 ?? -1) - (a.latest_news2 ?? -1);

// ── Auth ────────────────────────────────────────────────────────────────────

/** GET /me. In mock mode, `role` picks which demo user you are (default doctor). */
export function getMe(role: Role = "doctor"): Promise<Me> {
  if (USE_MOCKS) return mock(() => USERS[role]);
  return http<Me>("GET", "/me");
}

// ── Patients and records ────────────────────────────────────────────────────

/** GET /patients (the doctor's own), highest NEWS2 first. */
export async function getMyPatients(): Promise<PatientSummary[]> {
  const list = USE_MOCKS
    ? await mock((s) => s.patients.filter((p) => p.attending_doctor_id === USERS.doctor.id))
    : await http<PatientSummary[]>("GET", "/patients");
  return [...list].sort(byNews);
}

/** GET /patients/{id} */
export function getPatient(id: string): Promise<Patient> {
  if (USE_MOCKS) return mock((s) => s.patients.find((p) => p.id === id) ?? notFound(`Patient ${id}`));
  return http<Patient>("GET", `/patients/${encodeURIComponent(id)}`);
}

/** GET /patients/{id}/vitals?from=&to= — oldest first, default last 24 h. */
export function getVitals(patientId: string, opts: { from?: string; to?: string } = {}): Promise<Vital[]> {
  if (USE_MOCKS)
    return mock((s) =>
      (s.vitals[patientId] ?? []).filter(
        (v) => (!opts.from || v.ts >= opts.from) && (!opts.to || v.ts <= opts.to),
      ),
    );
  const q = new URLSearchParams();
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  const qs = q.toString();
  return http<Vital[]>("GET", `/patients/${encodeURIComponent(patientId)}/vitals${qs ? `?${qs}` : ""}`);
}

/** GET /patients/{id}/notes — newest first. */
export function getNotes(patientId: string): Promise<Note[]> {
  if (USE_MOCKS) return mock((s) => s.notes[patientId] ?? []);
  return http<Note[]>("GET", `/patients/${encodeURIComponent(patientId)}/notes`);
}

/** POST /patients/{id}/notes `{"text"}` → Note. Mock author defaults to Dr Trabelsi. */
export function addNote(patientId: string, text: string, opts: ActorOpts = {}): Promise<Note> {
  if (USE_MOCKS)
    return mock((s) => {
      const by = opts.by ?? USERS.doctor.id;
      const staff = s.staff.find((u) => u.id === by);
      s.seq.note += 1;
      const note: Note = {
        id: `n-${String(s.seq.note).padStart(4, "0")}`,
        author_id: by,
        author_role: staff?.role ?? "doctor",
        author_name: staff?.name ?? userName(by) ?? by,
        text,
        created_at: iso(now()),
      };
      (s.notes[patientId] ??= []).unshift(note);
      return note;
    });
  return http<Note>("POST", `/patients/${encodeURIComponent(patientId)}/notes`, { text });
}

// ── Prescriptions and doses ─────────────────────────────────────────────────

/** GET /patients/{id}/prescriptions */
export function getPrescriptions(patientId: string): Promise<Prescription[]> {
  if (USE_MOCKS) return mock((s) => s.prescriptions.filter((r) => r.patient_id === patientId && r.active));
  return http<Prescription[]>("GET", `/patients/${encodeURIComponent(patientId)}/prescriptions`);
}

const PENICILLIN_FAMILY = /amox|penic|ampic|augment/i;

/** POST /prescriptions → Prescription (`published_to_device` false when no device). */
export function createPrescription(req: CreatePrescriptionRequest, opts: ActorOpts = {}): Promise<Prescription> {
  if (USE_MOCKS)
    return mock((s) => {
      const patient = s.patients.find((p) => p.id === req.patient_id) ?? notFound(`Patient ${req.patient_id}`);
      const version = Math.max(0, ...s.prescriptions.filter((r) => r.patient_id === patient.id).map((r) => r.schedule_version)) + 1;
      s.seq.rx += 1;
      const created = now();
      const allergic = patient.allergies.some((a) => /penicillin/i.test(a));
      const rx: Prescription = {
        id: `rx-${String(s.seq.rx).padStart(4, "0")}`,
        patient_id: patient.id,
        doctor_id: opts.by ?? USERS.doctor.id,
        items: req.items,
        care_plan: req.care_plan,
        active: true,
        created_at: iso(created),
        schedule_version: version,
        published_to_device: !!patient.device_id,
        ...(allergic && req.items.some((i) => PENICILLIN_FAMILY.test(i.med)) ? { allergy_override: true } : {}),
      };
      s.prescriptions.push(rx);
      // Regenerate doses: one per (day × time) from today, future occurrences only.
      const today = tunisDate(iso(created));
      for (const item of req.items) {
        for (let d = 0; d < item.days + 1; d++) {
          const date = new Date(Date.parse(`${today}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
          for (const t of item.times) {
            const at = new Date(Date.parse(`${date}T${t}:00+01:00`));
            if (at <= created) continue;
            s.seq.dose += 1;
            s.doses.push({
              id: `d-${String(s.seq.dose).padStart(6, "0")}`,
              prescription_id: rx.id,
              patient_id: patient.id,
              scheduled_at: iso(at),
              time_of_day: t,
              meds: [item.med],
              slot: item.slot,
              status: "scheduled",
              taken_method: null,
              updated_at: iso(created),
              taken_at: null,
              given_by: null,
              given_by_name: null,
              instructions: item.slot == null ? "Give by hand" : null,
            });
          }
        }
      }
      s.doses.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      return rx;
    });
  return http<Prescription>("POST", "/prescriptions", req);
}

/**
 * GET /patients/{id}/doses?date=YYYY-MM-DD — NOT IN CONTRACT (med_doses rows, data-model.md).
 * Oldest first. Without `date`: every dose of the last 24 h and the rest of today.
 */
export function getDoses(patientId: string, opts: { date?: string } = {}): Promise<Dose[]> {
  if (USE_MOCKS)
    return mock((s) => {
      const ref = now().getTime();
      return s.doses.filter(
        (d) =>
          d.patient_id === patientId &&
          (opts.date ? tunisDate(d.scheduled_at) === opts.date : Date.parse(d.scheduled_at) >= ref - 86_400_000 && tunisDate(d.scheduled_at) <= tunisDate(iso(now()))),
      );
    });
  return http<Dose[]>("GET", `/patients/${encodeURIComponent(patientId)}/doses${opts.date ? `?date=${opts.date}` : ""}`);
}

/** POST /doses/{id}/given — NOT IN CONTRACT. Nurse gave the dose by hand → status `taken`. */
export function markDoseGiven(doseId: string, opts: ActorOpts = {}): Promise<Dose> {
  if (USE_MOCKS)
    return mock((s) => {
      const dose = s.doses.find((d) => d.id === doseId) ?? notFound(`Dose ${doseId}`);
      const by = opts.by ?? USERS.nurse.id;
      const t = iso(now());
      Object.assign(dose, { status: "taken", taken_at: t, updated_at: t, given_by: by, given_by_name: userName(by) ?? by });
      return dose;
    });
  return http<Dose>("POST", `/doses/${encodeURIComponent(doseId)}/given`, {});
}

// ── AI summary and assistant ────────────────────────────────────────────────

/**
 * GET /ai/summary/{patient_id}. Mock: `fallback: true` returns the rules-only
 * summary (the `?ai=rules` demo state); the review state is shared by both.
 */
export function getSummary(patientId: string, opts: { fallback?: boolean } = {}): Promise<AiSummary> {
  if (USE_MOCKS)
    return mock((s) => {
      const entry = s.summaries[patientId] ?? notFound(`Summary for ${patientId}`);
      return opts.fallback ? entry.rules : entry.model;
    });
  return http<AiSummary>("GET", `/ai/summary/${encodeURIComponent(patientId)}`);
}

/** POST /ai/summary/{patient_id}/review → the reviewed summary. */
export function reviewSummary(patientId: string, opts: ActorOpts & { fallback?: boolean } = {}): Promise<AiSummary> {
  if (USE_MOCKS)
    return mock((s) => {
      const entry = s.summaries[patientId] ?? notFound(`Summary for ${patientId}`);
      const by = opts.by ?? USERS.doctor.id;
      for (const v of [entry.model, entry.rules]) {
        v.human_confirmed_by = by;
        v.human_confirmed_by_name = userName(by) ?? by;
        v.reviewed_at = iso(now());
      }
      return opts.fallback ? entry.rules : entry.model;
    });
  return http<AiSummary>("POST", `/ai/summary/${encodeURIComponent(patientId)}/review`, {});
}

/** POST /ai/assistant `{"question"}` (patient, own record only). */
export function askAssistant(question: string): Promise<AssistantResponse> {
  if (USE_MOCKS) return mock(() => mockAssistant(question));
  return http<AssistantResponse>("POST", "/ai/assistant", { question });
}

// ── Appointments and waitlist ───────────────────────────────────────────────

const finalUrgency = (a: Appointment) => a.urgency_final ?? a.urgency_ai;

/**
 * GET /appointments/waitlist — requested appointments, `urgency_final ?? urgency_ai`
 * desc then oldest first. Confirmed rows leave the list (as on the real API).
 * `specialty` filters client-side; mock `fallback: true` returns rules-only triage.
 */
export async function getWaitlist(opts: { specialty?: string; fallback?: boolean } = {}): Promise<Appointment[]> {
  let list = USE_MOCKS
    ? await mock((s) => s.appointments.filter((a) => a.status === "requested"))
    : await http<Appointment[]>("GET", "/appointments/waitlist");
  if (opts.specialty) list = list.filter((a) => a.specialty === opts.specialty);
  if (USE_MOCKS && opts.fallback) {
    list = list.map((a) => {
      const triage = { ...a.triage, source: "rules" as const, confidence: null, model_urgency: null };
      return { ...a, triage, ai_suggested: triage };
    });
  }
  return list.sort((a, b) => finalUrgency(b) - finalUrgency(a) || a.created_at.localeCompare(b.created_at));
}

/** PATCH /appointments/{id} `{"urgency_final"}` — human override, sets `human_confirmed_by`. */
export function overrideUrgency(id: string, urgency: Urgency, opts: ActorOpts = {}): Promise<Appointment> {
  if (USE_MOCKS)
    return mock((s) => {
      const a = s.appointments.find((x) => x.id === id) ?? notFound(`Appointment ${id}`);
      const by = opts.by ?? USERS.admin.id;
      Object.assign(a, { urgency_final: urgency, human_confirmed_by: by, human_confirmed_by_name: userName(by) ?? by });
      return a;
    });
  return http<Appointment>("PATCH", `/appointments/${encodeURIComponent(id)}`, { urgency_final: urgency });
}

/** POST /appointments/{id}/confirm `{"slot_at","doctor_id","urgency_final"?}`. */
export function confirmAppointment(id: string, req: ConfirmAppointmentRequest, opts: ActorOpts = {}): Promise<Appointment> {
  if (USE_MOCKS)
    return mock((s) => {
      const a = s.appointments.find((x) => x.id === id) ?? notFound(`Appointment ${id}`);
      if (a.status !== "requested") throw new ApiError(409, "not_waiting", "Appointment is not waiting");
      const taken = s.appointments.some((x) => x.status === "confirmed" && x.slot_at === req.slot_at && x.doctor_id === req.doctor_id);
      if (taken) throw new ApiError(409, "slot_taken", "Slot already taken");
      const by = opts.by ?? USERS.admin.id;
      const name = userName(by) ?? by;
      Object.assign(a, {
        status: "confirmed",
        slot_at: req.slot_at,
        doctor_id: req.doctor_id,
        doctor_name: userName(req.doctor_id),
        confirmed_by: by,
        confirmed_by_name: name,
        human_confirmed_by: by,
        human_confirmed_by_name: name,
        ...(req.urgency_final ? { urgency_final: req.urgency_final } : {}),
      });
      return a;
    });
  return http<Appointment>("POST", `/appointments/${encodeURIComponent(id)}/confirm`, req);
}

/** GET /appointments?patient_id= (the patient's own), soonest slot first. */
export async function getMyAppointments(patientId: string): Promise<Appointment[]> {
  const list = USE_MOCKS
    ? await mock((s) => s.appointments.filter((a) => a.patient_id === patientId))
    : await http<Appointment[]>("GET", `/appointments?patient_id=${encodeURIComponent(patientId)}`);
  return list.sort((a, b) => (a.slot_at ?? "9").localeCompare(b.slot_at ?? "9"));
}

/** POST /appointments/{id}/reply `{"reply":"confirm|cancel"}` (patient). */
export function replyAppointment(id: string, reply: "confirm" | "cancel"): Promise<Appointment> {
  if (USE_MOCKS)
    return mock((s) => {
      const a = s.appointments.find((x) => x.id === id) ?? notFound(`Appointment ${id}`);
      if (reply === "confirm") a.patient_confirmed_at = iso(now());
      else a.status = "cancelled";
      return a;
    });
  return http<Appointment>("POST", `/appointments/${encodeURIComponent(id)}/reply`, { reply });
}

// ── Alerts ──────────────────────────────────────────────────────────────────

/** GET /alerts[?status=open] — newest first. */
export async function getAlerts(opts: { status?: "open" } = {}): Promise<Alert[]> {
  const list = USE_MOCKS
    ? await mock((s) => s.alerts.filter((a) => opts.status !== "open" || !a.acked_by))
    : await http<Alert[]>("GET", `/alerts${opts.status ? `?status=${opts.status}` : ""}`);
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** POST /alerts/{id}/ack → Alert with `acked_by`/`acked_at`. Mock actor defaults to Nurse Ines. */
export function ackAlert(id: string, opts: ActorOpts = {}): Promise<Alert> {
  if (USE_MOCKS)
    return mock((s) => {
      const a = s.alerts.find((x) => x.id === id) ?? notFound(`Alert ${id}`);
      const by = opts.by ?? USERS.nurse.id;
      Object.assign(a, { acked_by: by, acked_at: iso(now()), acked_by_name: userName(by) ?? by });
      return a;
    });
  return http<Alert>("POST", `/alerts/${encodeURIComponent(id)}/ack`, {});
}

// ── Devices and staff ───────────────────────────────────────────────────────

/** GET /devices */
export function getDevices(): Promise<Device[]> {
  if (USE_MOCKS) return mock((s) => s.devices);
  return http<Device[]>("GET", "/devices");
}

/** GET /staff — NOT IN CONTRACT (admin "Staff" screen). */
export function getStaff(): Promise<StaffMember[]> {
  if (USE_MOCKS) return mock((s) => s.staff);
  return http<StaffMember[]>("GET", "/staff");
}

// ── Composed nurse views ────────────────────────────────────────────────────

/**
 * The nurse ward board: one entry per bed (patients ∪ device beds), with the
 * latest vital and whether a call-nurse alert is open. Real mode composes
 * GET /patients?ward=, /devices, /alerts?status=open and /patients/{id}/vitals.
 */
export async function getWard(ward: string = DEFAULT_WARD): Promise<WardBed[]> {
  if (USE_MOCKS)
    return mock((s) => {
      const patients = s.patients.filter((p) => p.ward === ward);
      const beds = new Set([...s.boardBedOrder, ...patients.map((p) => p.bed ?? "")].filter(Boolean));
      return [...beds].map((bed) => {
        const patient = patients.find((p) => p.bed === bed) ?? null;
        const series = patient ? (s.vitals[patient.id] ?? []) : [];
        return {
          bed,
          patient,
          device: s.devices.find((d) => d.bed === bed) ?? null,
          latest: series[series.length - 1] ?? null,
          calling: !!patient && s.alerts.some((a) => a.patient_id === patient.id && a.kind === "call_nurse" && !a.acked_by),
        };
      });
    });
  const [patients, devices, alerts] = await Promise.all([
    http<PatientSummary[]>("GET", `/patients?ward=${encodeURIComponent(ward)}`),
    getDevices(),
    getAlerts({ status: "open" }),
  ]);
  const latest = await Promise.all(patients.map((p) => getVitals(p.id).then((v) => v[v.length - 1] ?? null)));
  const beds = new Set([...patients.map((p) => p.bed ?? ""), ...devices.map((d) => d.bed ?? "")].filter(Boolean));
  return [...beds]
    .map((bed) => {
      const i = patients.findIndex((p) => p.bed === bed);
      const patient = i >= 0 ? patients[i] : null;
      return {
        bed,
        patient,
        device: devices.find((d) => d.bed === bed) ?? null,
        latest: i >= 0 ? latest[i] : null,
        calling: !!patient && alerts.some((a) => a.patient_id === patient.id && a.kind === "call_nurse"),
      };
    })
    .sort((a, b) => (b.patient?.latest_news2 ?? -2) - (a.patient?.latest_news2 ?? -2));
}

/** The nurse med round: today's doses per ward patient (patients with no dose today are left out). */
export async function getMedRound(ward: string = DEFAULT_WARD): Promise<MedRoundGroup[]> {
  const today = tunisDate(iso(now()));
  if (USE_MOCKS)
    return mock((s) =>
      s.patients
        .filter((p) => p.ward === ward)
        .sort(byNews)
        .map((patient) => ({
          patient,
          device: s.devices.find((d) => d.id === patient.device_id) ?? null,
          doses: s.doses.filter((d) => d.patient_id === patient.id && tunisDate(d.scheduled_at) === today),
        }))
        .filter((g) => g.doses.length > 0),
    );
  const [summaries, devices] = await Promise.all([
    http<PatientSummary[]>("GET", `/patients?ward=${encodeURIComponent(ward)}`),
    getDevices(),
  ]);
  const groups = await Promise.all(
    [...summaries].sort(byNews).map(async (p) => ({
      patient: await getPatient(p.id),
      device: devices.find((d) => d.id === p.device_id) ?? null,
      doses: await getDoses(p.id, { date: today }),
    })),
  );
  return groups.filter((g) => g.doses.length > 0);
}
