# REST + WebSocket contract — v1.0

> **Version:** 1.2 (2026-10-05) · **Owners:** Wali (core, IoT, alerts), Faouzi (appointments, AI, integrations)
> Any change: open a PR that bumps the version above, add a changelog line, and announce it in the team chat.

## Conventions

- Base URL: `http://localhost:8000` (backend container `api`). The web app reads it from `NEXT_PUBLIC_API_URL`.
- JSON everywhere except file uploads (`multipart/form-data`).
- Auth: `Authorization: Bearer <jwt>`. JWT claims: `sub` (user id), `role` (`doctor|nurse|admin|patient`), `patient_id` (only for the patient role), `exp` (12 h).
- IDs are prefixed strings: `u-0001` user, `p-0001` patient, `a-0001` appointment, `rx-0001` prescription, `d-000001` dose, `al-0001` alert, `doc-0001` document, `adm-0001` admission, `bsu-001` device.
- Timestamps are ISO-8601 UTC strings (`2026-10-08T09:30:00Z`). (MQTT uses epoch seconds; the backend converts.)
- Errors: `{"detail": "human readable", "code": "snake_case_code"}` with the right HTTP status (400, 401, 403, 404, 409, 422).
- **Every read of a patient record** (`GET /patients/{id}` and every `GET /patients/{id}/*`) writes an `audit_log` row.
- Permissions per endpoint: see the role matrix in `data-model.md`. The column "Roles" below is the short version.

## Auth

| Method & path | Roles | Body → Response |
|---|---|---|
| `POST /auth/login` | public | `{"email","password"}` → `{"access_token","token_type":"bearer","user":{"id","name","role","patient_id"}}` |
| `GET /me` | any | → `{"id","name","email","role","patient_id"}` |

Seed accounts (password `ward1234` for all): `doctor@ward.tn`, `nurse@ward.tn`, `admin@ward.tn`, `patient@ward.tn` (linked to `p-0001`).

## Patients and records

| Method & path | Roles | Notes |
|---|---|---|
| `GET /patients?ward=&q=` | doctor (own), nurse (ward), admin (list only: name, bed, device) | → `[PatientSummary]` |
| `GET /patients/{id}` | doctor (own), nurse (ward), patient (self) | → `Patient` |
| `PATCH /patients/{id}` | doctor (own), nurse (ward; allergies + notes only) | partial `Patient` → `Patient` |
| `GET /patients/{id}/vitals?from=&to=` | doctor, nurse, patient (self) | → `[Vital]`, default last 24 h, max 5000 points |
| `GET /patients/{id}/prescriptions` | doctor, nurse, patient (self) | → `[Prescription]` |
| `GET /patients/{id}/notes` · `POST /patients/{id}/notes` | doctor, nurse | `{"text"}` → `Note` |

```jsonc
// PatientSummary
{ "id": "p-0001", "first_name": "Amira", "last_name": "Ben Salah", "age": 54, "ward": "Cardiology",
  "bed": "C-12", "device_id": "bsu-001", "latest_news2": 1, "open_alerts": 0 }
// Patient = PatientSummary + 
{ "sex": "F", "date_of_birth": "1972-03-14", "allergies": ["penicillin"], "history": "Hypertension",
  "attending_doctor_id": "u-0001", "admission_id": "adm-0001" }
// Vital
{ "ts": "2026-10-08T09:30:00Z", "hr": 88, "spo2": 97, "temp": 37.1, "nurse_id": "u-0002", "news2": 0, "source": "device" }
// Note
{ "id": "n-0001", "author_id": "u-0002", "author_role": "nurse", "text": "...", "created_at": "..." }
```

## Prescriptions → schedule

| Method & path | Roles | Notes |
|---|---|---|
| `POST /prescriptions` | doctor | Creates the prescription, regenerates the patient's `med_doses`, publishes a retained `schedule` (new `schedule_version`) to the assigned device |
| `PATCH /prescriptions/{id}` | doctor | `{"active": false}` stops it; schedule re-published |

```jsonc
// POST /prescriptions request
{ "patient_id": "p-0001",
  "items": [ { "med": "Paracetamol 500mg", "times": ["08:00","20:00"], "slot": 1, "days": 5 } ],
  "care_plan": "Monitor temperature every 4h" }
// response: Prescription
{ "id": "rx-0001", "patient_id": "p-0001", "doctor_id": "u-0001", "items": [...], "care_plan": "...",
  "active": true, "created_at": "...", "schedule_version": 4, "published_to_device": true }
```

`published_to_device` is `false` if the patient has no device; the call still succeeds.

## Admissions, beds, devices

| Method & path | Roles | Notes |
|---|---|---|
| `GET /devices` | admin, nurse | → `[{"id","online","fw_version","last_seen","patient_id","bed"}]` |
| `POST /devices/{id}/assign` | admin | `{"patient_id","bed"}` → creates/updates the admission and publishes the schedule |
| `POST /admissions/{id}/discharge` | admin, doctor | Clears the device schedule (`patient_id:null`), sets `discharged_at`, fires the n8n `patient.discharged` event (W6) |
| `POST /devices/{id}/command` | doctor, nurse, admin | `{"type","text?","dose_id?"}`, forwarded to MQTT `command` (demo helper) |

## Appointments and waitlist (Faouzi)

| Method & path | Roles | Notes |
|---|---|---|
| `POST /appointments` | patient (self), admin | Runs triage synchronously (fallback if the LLM is slow) → `Appointment` with `status:"requested"` |
| `GET /appointments/waitlist` | admin, doctor | Requested appointments sorted by `urgency_final ?? urgency_ai` desc, then `created_at` asc |
| `GET /appointments?patient_id=&status=` | admin, doctor, patient (self) | |
| `PATCH /appointments/{id}` | admin, doctor | `{"urgency_final": 1-5}`: human override of the AI urgency without booking a slot; sets `human_confirmed_by` |
| `POST /appointments/{id}/confirm` | admin, doctor | `{"slot_at","urgency_final"?,"doctor_id"}`; `urgency_final` set means a human override of the AI. Sets `confirmed_by` |
| `POST /appointments/{id}/cancel` | admin, patient (self) | `{"reason"?}`; fires the n8n `appointment.cancelled` event (W2 backfill) |
| `POST /appointments/{id}/reply` | patient (self) | `{"reply":"confirm\|cancel"}`: the patient's answer to the W1 reminder. `confirm` sets `patient_confirmed_at`; `cancel` = the cancel flow |

```jsonc
// POST /appointments request
{ "patient_id": "p-0003", "referral_text": "ألم في الصدر منذ يومين / douleur thoracique", "symptoms": ["chest pain"],
  "preferred_dates": ["2026-10-12"] }
// Appointment
{ "id": "a-0001", "patient_id": "p-0003", "status": "requested|confirmed|cancelled|done|no_show",
  "urgency_ai": 5, "urgency_final": null, "triage": { "urgency": 5, "reasons": ["..."], "red_flags": ["chest_pain"], "source": "llm|fallback" },
  "slot_at": null, "doctor_id": null, "confirmed_by": null, "patient_confirmed_at": null, "no_show_prob": 0.18, "created_at": "..." }
```

## Alerts

| Method & path | Roles | Notes |
|---|---|---|
| `GET /alerts?status=open` | doctor, nurse | → `[Alert]` newest first |
| `POST /alerts/{id}/ack` | doctor, nurse | sets `acked_by`, `acked_at` |

```jsonc
// Alert
{ "id": "al-0001", "patient_id": "p-0001", "device_id": "bsu-001",
  "kind": "news2|trend|call_nurse|dose_missed|device_offline",
  "severity": "low|medium|high|critical", "news2": 7, "message": "SpO2 89%, HR 128",
  "created_at": "...", "acked_by": null, "acked_at": null }
```

## AI (Faouzi; early warning is internal, owned by Wali)

| Method & path | Roles | Notes |
|---|---|---|
| `POST /ai/triage` | admin, doctor | `{"referral_text","symptoms[]","age","history"}` → `{"urgency":1-5,"reasons[]","red_flags[]","source"}`. Preview only, nothing stored |
| `GET /ai/summary/{patient_id}` | doctor | → `{"summary","interactions":[{"drugs":[a,b],"severity","note"}],"source","generated_at","human_confirmed_by"}` (cached 10 min; `human_confirmed_by` is null until a doctor reviews it, and the UI shows "needs review" until then) |
| `POST /ai/summary/{patient_id}/review` | doctor | Marks the latest summary as reviewed (`human_confirmed_by`) |
| `POST /ai/digitize` | doctor, nurse | multipart `file` + `patient_id` → stores in MinIO and returns `{"document_id","fields":{name:{"value","confidence"}},"source"}` |
| `POST /ai/digitize/{document_id}/approve` | doctor, nurse | `{"fields":{...edited}}` → writes the structured record; sets `human_confirmed_by` |
| `POST /ai/assistant` *(stretch)* | patient | `{"question"}` → `{"answer","sources[]"}`, scoped to the caller's own record |

`source` is `"llm"` or `"fallback"` on every AI response, so the UI can show a badge.

## Integrations (n8n callbacks — Faouzi)

All are authenticated with the header `X-N8N-Secret: ${N8N_CALLBACK_SECRET}` (no JWT). See `n8n-webhooks.md`.

| Method & path | Body |
|---|---|
| `POST /integrations/n8n/appointment-reply` | `{"appointment_id","reply":"confirm\|cancel"}` |
| `POST /integrations/n8n/backfill-accept` | `{"appointment_id","slot_at"}` → `{"status":"confirmed"}` · 409 `slot_taken` / `not_waiting` |
| `GET /integrations/n8n/daily-digest[?doctor_id=]` | → `[{"doctor":{"id","name","email"},"patients":[{"name","bed","news2","summary"}]}]` |
| `POST /integrations/n8n/follow-up` | `{"patient_id","days"}` → `{"appointment_id","status":"requested"}` |

## Health

`GET /health` → `{"status":"ok","db":true,"mqtt":true}` (public).

## WebSocket

`WS /ws?token=<jwt>`: the server pushes JSON frames; the client sends nothing (except optional `{"type":"ping"}`).

```jsonc
{ "type": "vital",         "data": { "patient_id": "p-0001", "device_id": "bsu-001", "ts": "...", "hr": 88, "spo2": 97, "temp": 37.1, "news2": 0 } }
{ "type": "alert",         "data": Alert }
{ "type": "call_nurse",    "data": { "patient_id": "p-0001", "device_id": "bsu-001", "bed": "C-12", "ts": "..." } }
{ "type": "dose_event",    "data": { "patient_id": "p-0001", "dose_id": "d-000123", "status": "dispensed|taken|missed", "method": "ir|button", "ts": "..." } }
{ "type": "device_status", "data": { "device_id": "bsu-001", "online": false, "ts": "..." } }
```

Filtering: a nurse receives frames for their ward, a doctor for their own patients, an admin only `device_status`. Patients do not connect.

## Changelog

- **1.2** (2026-10-05): `GET /ai/summary/{patient_id}` also returns `human_confirmed_by`, so the doctor view can show "needs review" / "reviewed" (AI-output convention). Both sides: Faouzi.

- **1.1** (2026-10-05): integrations callbacks aligned with n8n-webhooks v1.2 (`backfill-accept` responses, `daily-digest` list shape with doctor email, new `follow-up`); the `n8n@ward.tn` service account is no longer needed.

- **1.0** (2026-10-05): initial freeze. Adds `PATCH /appointments/{id}` (urgency override), `/appointments/{id}/reply`, `/ai/summary/{id}/review`, `/me`, `/patients/{id}/prescriptions`, `/patients/{id}/notes`, discharge, digitize-approve, device command and `/integrations/n8n/*` to the brief's drafts.
