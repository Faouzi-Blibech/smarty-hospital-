# n8n contract — v1.0

> **Version:** 1.0 (frozen 2026-10-05) · **Owners:** Faouzi (workflows + callbacks), Wali (event emitter in the backend)
> Any change: open a PR that bumps the version above, add a changelog line, and announce it in the team chat.

## Rules (locked)

- n8n is **self-hosted** (container `n8n`, UI at `http://localhost:5678`). It is not the source of truth.
- The backend → n8n direction carries **events**. The n8n → backend direction carries **callbacks** to `/integrations/n8n/*` with the header `X-N8N-Secret`.
- On-device medication reminders never go through n8n.
- Event posting is fire-and-forget: 3 s timeout, failures are logged, and the API never fails because n8n is down.
- Demo channels: **Telegram** (bot token in n8n credentials) and **email** (SMTP, e.g. a Gmail app password). SMS is out of scope.
- Payloads carry **first names only**, never national IDs or full records.
- Every workflow is exported as JSON to `n8n/workflows/W<n>-<slug>.json` (credentials are NOT exported; recreate them from `n8n/README.md`).

## Transport

The backend emits every event to **one** webhook URL with an envelope, and n8n routes on `event` with a Switch node:

```
POST ${N8N_WEBHOOK_URL}            # default http://n8n:5678/webhook/ward-events
Content-Type: application/json
X-Ward-Secret: ${N8N_EVENT_SECRET}
```

```json
{ "event": "alert.critical", "ts": "2026-10-08T09:30:00Z", "data": { } }
```

Backend helper (Wali implements it in `backend/app/integrations/n8n.py`; everyone calls it):

```python
def emit(event: str, data: dict) -> None:
    """Fire-and-forget: posts on a daemon thread with a 3 s timeout, logs failures, never raises."""
```

## Events (backend → n8n)

| Event | Fired when | `data` | Workflow |
|---|---|---|---|
| `appointment.confirmed` | `POST /appointments/{id}/confirm` | `{appointment_id, patient_first_name, patient_telegram_chat_id, patient_email, slot_at, doctor_name}` | W1 schedules the 24 h reminder |
| `appointment.cancelled` | `POST /appointments/{id}/cancel` or a W1 "cancel" reply | `{appointment_id, slot_at, doctor_id}` | W2 backfill |
| `dose.missed` | `events/dose_missed` ingested | `{dose_id, patient_id, patient_first_name, bed, meds[], scheduled_at, nurse_chat_ids[]}` | W3 |
| `alert.critical` | alert with severity `high` or `critical` | `{alert_id, patient_first_name, bed, kind, news2, message, nurse_chat_ids[], doctor_chat_id}` | W4 |
| `patient.discharged` | `POST /admissions/{id}/discharge` | `{patient_id, patient_first_name, patient_email, patient_telegram_chat_id, doctor_id, discharged_at}` | W6 |

W5 (daily digest) is cron-driven inside n8n and pulls from `GET /integrations/n8n/daily-digest`.

## Callbacks (n8n → backend)

| Callback | Used by | Body |
|---|---|---|
| `POST /integrations/n8n/appointment-reply` | W1 stretch (Telegram inline button via tunnel) | `{"appointment_id","reply":"confirm\|cancel"}` |
| `POST /integrations/n8n/backfill-accept` | W2 | `{"appointment_id","slot_at"}` |
| `GET /integrations/n8n/daily-digest?doctor_id=` | W5 | → `{"doctor","patients":[...]}` |
| `POST /appointments` (with a service JWT) | W6 | books the follow-up as `requested` with `referral_text: "Post-discharge follow-up"` |

The backend base URL from inside Docker is `http://api:8000`.

## Workflows

| ID | Name | Priority | Trigger → steps |
|---|---|---|---|
| W4 | Critical-alert fan-out | **core, Day 1** | event `alert.critical` → Telegram message to each `nurse_chat_ids` + `doctor_chat_id`: "🚨 Bed {bed} · {patient_first_name} · NEWS2 {news2}: {message}" |
| W3 | Missed-dose escalation | **core, Day 2** | event `dose.missed` → Telegram to the ward nurses ("💊 Missed dose · Bed {bed} · {meds}") + email to the attending doctor |
| W1 | Appointment reminder | **core, Day 2** | event `appointment.confirmed` → Wait until `slot_at − 24h` → Telegram + email with two links to the web app: `${WEB_URL}/patient/appointments/{appointment_id}?action=confirm\|cancel` (the patient view calls the API). *Demo trick:* if `slot_at` is < 24 h away, send immediately. *Stretch:* Telegram inline buttons → `appointment-reply` callback (needs a public HTTPS tunnel such as `cloudflared` because Telegram triggers are webhooks) |
| W2 | Slot backfill | stretch | event `appointment.cancelled` → GET waitlist → offer the slot to the top patient → on accept, callback `backfill-accept` |
| W5 | Doctor daily digest | stretch | Cron 07:30 → GET daily-digest → email |
| W6 | Discharge follow-up | stretch | event `patient.discharged` → book the follow-up (+14 days) → Telegram/email to the patient |

## Changelog

- **1.0** (2026-10-05): initial freeze. W1 replies go through web-app links (Telegram buttons need a public tunnel). Adds the single-webhook envelope, the secrets and the core/stretch split.
