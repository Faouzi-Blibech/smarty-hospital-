# Ward — Architecture

> Ward (وَرد) is "rose" in Arabic and a "hospital ward" in English. It is a connected smart-hospital ecosystem
> in which patient, nurse, doctor and administration share one patient record and the patient process is automated.

## 1. Problem and framing

Tunisian hospitals today:
- Patients who need care fast often get appointments 6–12 months away.
- Doctors and nurses log, search and re-read paper records every day.
- Patient, nurse, doctor and administration have no shared system.

**Ward automates the patient process**: no paper, fewer no-shows, urgency-aware booking and automatic follow-ups.
Shorter waits are the *result*. We do not claim to "solve the waitlist".

**Locked principles:**
- **Human in the loop:** AI suggests and a human confirms.
- **Privacy:** self-hosted, RBAC, an audit log of every read, and anonymized cloud LLM calls (Tunisian Organic Law 2004-63 / INPDP).
- **Prototype honesty:** sensors are not medical-grade and the AI is not clinically validated.
- **Data:** synthetic only.

## 2. System architecture

```mermaid
flowchart TB
  subgraph USERS["Users & devices"]
    BSU["Bedside Unit<br/>ESP32 + TFT + sensors<br/>+ pill carousel"]
    SIM["simulator/<br/>(fake devices)"]
    PWA["Next.js PWA<br/>doctor · nurse · admin · patient"]
    TG["Telegram / email"]
  end

  subgraph CONN["Connectivity"]
    MQ["Mosquitto<br/>MQTT :1883"]
    API["FastAPI gateway<br/>REST + WS · JWT + RBAC :8000"]
  end

  subgraph SVC["Backend services (one codebase: backend/)"]
    WRK["MQTT ingestion worker"]
    VIT["Vitals & Alerts"]
    APT["Appointments & Waitlist"]
    REC["Patient records"]
    RX["Prescriptions & Med schedule"]
    AI["AI engine<br/>triage · early warning · copilot<br/>digitizer · no-show · assistant"]
    LLM["ai/llm.py<br/>provider-agnostic wrapper<br/>(PII stripped)"]
  end

  subgraph DATA["Data (hospital's own server)"]
    PG[("PostgreSQL<br/>+ TimescaleDB")]
    MINIO[("MinIO<br/>documents")]
    AUD[("audit_log")]
  end

  N8N["n8n (self-hosted) :5678"]

  BSU <-->|MQTT| MQ
  SIM <-->|MQTT| MQ
  MQ --> WRK
  WRK --> VIT
  RX -->|retained schedule| MQ
  PWA <-->|HTTPS + WS| API
  API --- VIT & APT & REC & RX & AI
  AI --> LLM
  VIT & APT & REC & RX & WRK --> PG
  REC --> MINIO
  API --> AUD
  API -->|events| N8N
  N8N -->|callbacks| API
  N8N --> TG
```

**Containers** (`infra/docker-compose.yml`): `db` (timescale/timescaledb, pg16), `mqtt` (eclipse-mosquitto 2), `minio`, `n8n`, `api` (FastAPI), `worker` (same image, runs `python -m app.iot.worker`), `web` (Next.js).

## 3. Users and use cases

```mermaid
flowchart LR
  P(("Patient"))
  N(("Nurse"))
  D(("Doctor"))
  A(("Admin"))

  subgraph Ward
    UC1["Request appointment"]
    UC2["Med reminders on bedside screen"]
    UC3["See prescriptions & next visit"]
    UC4["Call-nurse button"]
    UC5["Home care via app after discharge"]
    UC6["Ask patient assistant (stretch)"]
    UC7["Log vitals via RFID tap"]
    UC8["Update patient record / notes"]
    UC9["Receive abnormal-vitals alerts"]
    UC10["Med-round checklist"]
    UC11["Patient list + AI daily summary"]
    UC12["Prescribe & plan care"]
    UC13["Vitals history & trends"]
    UC14["Set / confirm urgency"]
    UC15["Review digitized paper records"]
    UC16["Bookings & AI-ranked waitlist"]
    UC17["Assign beds & devices"]
    UC18["Staff accounts & roles"]
    UC19["Hospital dashboard"]
  end

  P --- UC1 & UC2 & UC3 & UC4 & UC5 & UC6
  N --- UC7 & UC8 & UC9 & UC10 & UC15
  D --- UC11 & UC12 & UC13 & UC14 & UC15 & UC9
  A --- UC16 & UC17 & UC18 & UC19 & UC14
```

All four roles share **one patient record** and see only what their permissions allow (matrix in `contracts/data-model.md`).

**Role owners** (each is responsible for their role's flow end-to-end in the demo): Patient → Hedi · Nurse → Wali · Doctor + Admin → Faouzi.

## 4. Patient journey (swimlane)

```mermaid
sequenceDiagram
  autonumber
  actor P as Patient
  actor A as Admin
  actor D as Doctor
  actor N as Nurse
  participant S as System + AI
  participant B as Bedside Unit

  P->>S: Request appointment (app / reception)
  S->>S: Triage: red-flag rules + LLM → urgency 1–5
  S-->>A: AI-ranked waitlist
  A->>S: Confirm booking (may override urgency)
  S-->>P: Confirmation + 24h reminder (n8n W1)
  D->>S: Consultation → prescription + care plan
  S->>B: Retained MQTT schedule (med_doses)
  B-->>S: schedule_ack
  Note over B: Dose time (RTC, works offline)
  B->>B: Rotate carousel · buzz
  P->>B: Takes pill (IR) or presses "Taken"
  B-->>S: dose_taken (or dose_missed → n8n W3)
  N->>B: RFID badge tap → nurse mode → measure
  B-->>S: vitals {nurse_rfid}
  S->>S: Early warning (NEWS2 partial + trend)
  alt abnormal
    S-->>N: WS alert + Telegram (n8n W4)
    S-->>D: WS alert + Telegram
  end
  D->>S: Daily review with AI summary
  A->>S: Discharge
  S-->>P: Follow-up booked (n8n W6) · home care in app
```

**Golden demo path:** the journey above, plus a live **paper digitizer** moment and a **simulated abnormal vital** that fires an alert on the dashboard and on Telegram.

## 5. Hardware: Smart Bedside Unit with pill carousel (Option A)

```mermaid
flowchart LR
  PWR["5V 2A USB<br/>+ 18650 backup"] --> ESP
  subgraph ESP["ESP32 DevKit"]
    direction TB
    WIFI["Wi-Fi + MQTT"]
    NVS["NVS: schedule, msg_id"]
    RB["Ring buffer (offline)"]
  end
  ESP ---|"SPI · CS_TFT"| TFT["2.8in ILI9341 touch TFT<br/>LVGL UI"]
  ESP ---|"SPI · CS_RFID"| RFID["RC522 RFID<br/>nurse badge / wristband"]
  ESP ---|"I2C 0x57"| MAX["MAX30102<br/>HR + SpO2"]
  ESP ---|"I2C 0x5A"| MLX["MLX90614<br/>temperature"]
  ESP ---|"I2C 0x68"| RTC["DS3231 RTC"]
  ESP ---|GPIO| BTN["Call-nurse button"]
  ESP ---|"PWM / GPIO"| BZ["Buzzer + LED"]
  ESP ---|"4 GPIO"| ULN["ULN2003"] --> STEP["28BYJ-48 stepper<br/>pill carousel"]
  ESP ---|"GPIO (input)"| IR["IR sensor in tray"]
```

- TFT, touch and RC522 share SPI with separate CS pins. MAX30102, MLX90614 and DS3231 share I2C (distinct addresses).
- GPIO 34–39 are input-only, so they suit the IR sensor and the button, never the stepper.
- The final pin assignment lives in `firmware/PINMAP.md` (Hedi + Wali, Day 1).
- **Carousel:** a store-bought round rotating pill organizer (or a foam-board build) sits on the stepper over a base with one drop hole. The IR sensor in the tray detects that the pill was removed.

**Device screens:**
- **Home:** first name, clock, next dose, online/offline icon.
- **Dose reminder:** full screen + buzzer + "Taken".
- **Measure:** "place finger".
- **Call-nurse confirmation.**
- **Nurse mode** (after an RFID tap): shows the patient; vitals are tagged with the nurse.

**Dose flow (Option A):**
1. At dose time, rotate to the dose's `slot` → `dose_dispensed`.
2. Buzz.
3. Wait for IR pickup or the "Taken" button → `dose_taken {method}`.
4. After 30 min with no pickup → `dose_missed` → the backend sends it to n8n W3.

**Offline:**
- The schedule lives in NVS and reminders fire from the RTC.
- Vitals and events go into a 128-entry ring buffer with RTC timestamps and are replayed on reconnect; the server deduplicates on `msg_id`.
- An MQTT last-will reports offline status.

**Fallback (go/no-go end of Day 2):** if the carousel is unreliable, skip the rotation and keep the "Taken" button. The MQTT events stay identical.

## 6. AI layer (human in the loop)

```mermaid
flowchart LR
  subgraph In["Inputs"]
    REF["Referral + symptoms<br/>(AR / FR / Darija)"]
    VS["Vitals stream"]
    H24["24h vitals + notes + meds"]
    IMG["Photo of paper record"]
    HIST["Booking history"]
    Q["Patient question"]
  end
  subgraph Mods["backend/app/ai/"]
    T["1 · Triage<br/>red-flag rules + LLM JSON"]
    EW["2 · Early warning<br/>NEWS2 partial + z-score"]
    CP["3 · Doctor copilot<br/>LLM summary + interaction list"]
    DG["4 · Paper digitizer<br/>vision LLM + confidence"]
    NS["5 · No-show model<br/>LogReg on Kaggle dataset"]
    PA["6 · Patient assistant<br/>(stretch) scoped tools"]
  end
  W["llm.py wrapper<br/>strip PII · LLM_PROVIDER · timeout → fallback"]
  subgraph Human["Human confirms"]
    HA["Admin / doctor<br/>confirms waitlist order"]
    HN["Nurse + doctor<br/>ack alert"]
    HD["Doctor reviews summary"]
    HR["Nurse / doctor<br/>approves fields"]
    HO["Admin can override booking"]
  end
  REF --> T --> HA
  VS --> EW --> HN
  H24 --> CP --> HD
  IMG --> DG --> HR
  HIST --> NS --> HO
  Q --> PA
  T & CP & DG & PA -.-> W
```

| # | Module | Owner | Deterministic fallback |
|---|---|---|---|
| 1 | Triage | Faouzi | Red-flag rule list + keyword score → urgency |
| 2 | Early warning | Wali | Pure rules, so it is its own fallback |
| 3 | Doctor copilot | Faouzi | Templated summary from min/max/latest vitals + the curated interaction list |
| 4 | Paper digitizer | Faouzi | Pre-baked extraction for `demo_record.jpg` |
| 5 | No-show model | Hedi | Base rate (≈0.20) |
| 6 | Patient assistant (stretch) | Faouzi | "Please ask your nurse" + next dose / next visit from the DB |

**Rules for every module:**
- All LLM calls go through `backend/app/ai/llm.py`.
- Every output is stored with `ai_suggested` + `human_confirmed_by`.
- Prompts and red-flag lists are versioned files in `backend/app/ai/prompts/` and `backend/app/ai/rules/`.

**Early-warning thresholds** (NEWS2 partial, single-parameter bands; **verify against the official RCP NEWS2 chart before the demo**):

| Parameter | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|---|
| Heart rate (bpm) | ≤40 | | 41–50 | 51–90 | 91–110 | 111–130 | ≥131 |
| SpO2 scale 1 (%) | ≤91 | 92–93 | 94–95 | ≥96 | | | |
| Temperature (°C) | ≤35.0 | | 35.1–36.0 | 36.1–38.0 | 38.1–39.0 | ≥39.1 | |

Partial score → severity:
- 0 → none
- 1–2 → low
- 3–4 → medium
- any single parameter = 3 → high
- ≥5 → high
- ≥7 → critical

**Trend:** a rolling z-score over the patient's last 30 readings; |z| ≥ 3 on HR or SpO2 raises a `trend` alert (medium).

## 7. Data and privacy

- Everything runs from one `docker compose` on the hospital's server.
- RBAC is enforced in FastAPI dependencies. Every read of a patient record appends an `audit_log` row. Postgres RLS is the Day 4 stretch / production plan.
- `llm.py` replaces names, phone numbers and IDs with placeholders before any cloud call. `LLM_PROVIDER=local` routes to a local model (e.g. Ollama) instead.
- Seed data is synthetic (`backend/app/seed.py`).
