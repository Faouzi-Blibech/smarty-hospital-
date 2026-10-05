# n8n workflows (owner: Faouzi)

Self-hosted n8n runs in Docker at http://localhost:5678. The contract is `docs/contracts/n8n-webhooks.md`.

## Layout

- `workflows/W<n>-<slug>.json`: exported workflows (n8n → ⋯ → Download). Commit them after every change.
- Credentials are **never** exported. Recreate them on each machine:
  - **Telegram API**: bot token from @BotFather (`/newbot`), credential name `ward-telegram`.
  - **SMTP**: e.g. a Gmail app password, credential name `ward-smtp`.
  - **Header Auth** for callbacks to the API: name `ward-callback`, header `X-N8N-Secret`, value = `N8N_CALLBACK_SECRET` from `.env`.

## Entry webhook

All backend events arrive at `POST /webhook/ward-events` with `{event, ts, data}` and header `X-Ward-Secret`.
The router workflow (`W0-router.json`) checks the secret, then fans out on `event` with a Switch node.

## Import (CLI, recommended)

The compose file mounts `n8n/workflows/` read-only at `/ward-workflows`. Workflow IDs are fixed (`wardRouterW00000`,
`wardCritAlertW04`, …) because the router calls each sub-workflow by ID.

```bash
# Git Bash on Windows: export MSYS_NO_PATHCONV=1 first, or the container paths get rewritten
C="docker compose -f infra/docker-compose.yml exec -T n8n"
for f in W4-critical-alert W3-missed-dose W1-appointment-reminder W2-slot-backfill W6-discharge-follow-up W5-doctor-daily-digest W0-router; do   # sub-workflows first
  $C n8n import:workflow --input=/ward-workflows/$f.json
done
for id in wardCritAlertW04 wardMissedDoseW3 wardApptRemindW1 wardBackfillW2xx wardFollowUpW6xx wardDigestW5xxxx wardRouterW00000; do
  $C n8n publish:workflow --id=$id
done
docker compose -f infra/docker-compose.yml restart n8n
```

Then in the UI → Credentials, create (or edit) **`ward-telegram`** (bot token) and **`ward-smtp`** (e.g. Gmail: `smtp.gmail.com`, port 465, SSL, an app password). All Telegram/Email nodes point to them.
If a Telegram or Email node shows the credential as missing (a credential created in the UI gets a new ID), open the workflow → the node → pick `ward-telegram` / `ward-smtp` → save + publish. One click, once per laptop.

Every Telegram/Email node uses `onError: continueRegularOutput`: one bad recipient (e.g. someone who never pressed /start on the bot, Telegram 403) doesn't stop the others.

## Workflows

| File | ID | Status |
|---|---|---|
| `W0-router.json` | `wardRouterW00000` | ✅ checks `X-Ward-Secret`, drops unknown events, routes `alert.critical` → W4, `dose.missed` → W3, `appointment.confirmed` → W1, `appointment.cancelled` → W2, `patient.discharged` → W6 |
| `W4-critical-alert.json` | `wardCritAlertW04` | ✅ one Telegram message per nurse + doctor chat ID |
| `W3-missed-dose.json` | `wardMissedDoseW3` | ✅ Telegram to ward nurses + attending doctor, email to the doctor (contract v1.1 fields `doctor_chat_id`, `doctor_email`) |
| `W1-appointment-reminder.json` | `wardApptRemindW1` | ✅ waits until `slot_at − 24h` (sends at once if the slot is sooner: demo trick), then Telegram + email to the patient with confirm/cancel links to `${WEB_URL}/patient/appointments/{id}?action=…` |
| `W2-slot-backfill.json` | `wardBackfillW2xx` | Offers a freed slot to the event's `candidate` (Telegram + email, link previews off) with an accept link valid 2 h (n8n resume URL under `N8N_PUBLIC_URL`). On click: `backfill-accept` → HTML result page + confirmation, or "slot already taken" on 409. A used link answers 409. |
| `W6-discharge-follow-up.json` | `wardFollowUpW6xx` | Calls `follow-up` (14 days) and, only if the backend created the appointment, tells the patient over Telegram + email that the follow-up is requested and the hospital will confirm the date. |
| `W5-doctor-daily-digest.json` | `wardDigestW5xxxx` | Every day at 07:30 Africa/Tunis (or on demand via its "Run now" trigger): `GET daily-digest`, then one email per doctor with an address and at least one admitted patient. Patients are listed by bed, highest NEWS2 first, with NEWS2 >= 5 flagged "review first" and summaries labelled as AI suggestions to review. Not called by the router. |

## Test

W4 (critical alert):

```bash
curl -X POST localhost:5678/webhook/ward-events -H "X-Ward-Secret: change-me-event" -H "Content-Type: application/json"   -d '{"event":"alert.critical","ts":"2026-10-06T10:00:00Z","data":{"patient_first_name":"Amira","bed":"C-12","kind":"news2","news2":8,"message":"SpO2 88%, HR 130","nurse_chat_ids":["<your chat id>"],"doctor_chat_id":"<your chat id>"}}'
```

The webhook always answers 200 (`responseMode: onReceived`). A wrong secret is silently dropped; check Executions in the UI.

W3 (missed dose) and W1 (reminder, slot 2 h from now so it sends immediately):

```bash
curl -X POST localhost:5678/webhook/ward-events -H "X-Ward-Secret: change-me-event" -H "Content-Type: application/json" -d '{"event":"dose.missed","ts":"2026-10-06T08:31:00Z","data":{"dose_id":"d-000123","patient_first_name":"Amira","bed":"C-12","meds":["Paracetamol 500mg"],"scheduled_at":"2026-10-06T07:00:00Z","nurse_chat_ids":["<chat id>"],"doctor_chat_id":"<chat id>","doctor_email":"<you@mail>"}}'
curl -X POST localhost:5678/webhook/ward-events -H "X-Ward-Secret: change-me-event" -H "Content-Type: application/json" -d '{"event":"appointment.confirmed","ts":"x","data":{"appointment_id":"a-0001","patient_first_name":"Amira","patient_telegram_chat_id":"<chat id>","patient_email":"<you@mail>","slot_at":"<ISO time ~2h from now>","doctor_name":"Dr Trabelsi"}}'
```

A far-away `slot_at` parks the W1 execution in **Waiting** until 24 h before the slot (visible under Executions).

W2 (slot backfill): send the event, then open the `accept_url` (Executions → the waiting W2 run → "Plan offer" output, or the link in the Telegram/email):

```bash
curl -X POST localhost:5678/webhook/ward-events -H "X-Ward-Secret: change-me-event" -H "Content-Type: application/json" -d '{"event":"appointment.cancelled","ts":"x","data":{"appointment_id":"a-0003","slot_at":"<ISO slot>","doctor_id":"u-0001","doctor_name":"Dr Trabelsi","candidate":{"appointment_id":"a-0007","patient_first_name":"Sami","patient_telegram_chat_id":"<chat id>","patient_email":"<you@mail>"}}}'
```

W6 (discharge follow-up):

```bash
curl -X POST localhost:5678/webhook/ward-events -H "X-Ward-Secret: change-me-event" -H "Content-Type: application/json" -d '{"event":"patient.discharged","ts":"x","data":{"patient_id":"p-0001","patient_first_name":"Amira","patient_email":"<you@mail>","patient_telegram_chat_id":"<chat id>","doctor_id":"u-0001","discharged_at":"2026-10-08T10:00:00Z"}}'
```

W5 (doctor digest) on demand, without waiting for 07:30:

```bash
# N8N_RUNNERS_BROKER_PORT avoids a port clash with the running n8n
docker compose -f infra/docker-compose.yml exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=wardDigestW5xxxx
```

Or open W5 in the UI and click "Execute workflow". Note: in `n8n execute` (CLI) mode the Email node fails with "license provider has not been set", a CLI-only limitation. Use the UI to actually send the digest.

## Testing workflows without the backend

Point n8n at any stub that implements the `/integrations/n8n/*` callbacks:

```bash
WARD_API_URL=http://host.docker.internal:8099 docker compose -f infra/docker-compose.yml up -d --force-recreate n8n
```
