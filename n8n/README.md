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
$C n8n import:workflow --input=/ward-workflows/W4-critical-alert.json   # sub-workflows first
$C n8n import:workflow --input=/ward-workflows/W0-router.json
$C n8n publish:workflow --id=wardCritAlertW04
$C n8n publish:workflow --id=wardRouterW00000
docker compose -f infra/docker-compose.yml restart n8n
```

Then in the UI → Credentials, create (or edit) **`ward-telegram`** with your bot token. W4's Telegram node points to it.
If W4's Telegram node shows the credential as missing (a credential created in the UI gets a new ID), open W4 → Telegram node → pick `ward-telegram` → save + publish. One click, once per laptop.

W4's Telegram node uses `onError: continueRegularOutput`: a recipient who never pressed /start on the bot (Telegram 403) doesn't stop the others from getting the alert.

## Workflows

| File | ID | Status |
|---|---|---|
| `W0-router.json` | `wardRouterW00000` | ✅ checks `X-Ward-Secret`, drops unknown events, routes `alert.critical` → W4 (other outputs: 1 dose.missed, 2 appointment.confirmed, 3 appointment.cancelled, 4 patient.discharged) |
| `W4-critical-alert.json` | `wardCritAlertW04` | ✅ one Telegram message per nurse + doctor chat ID |

## Test W4

```bash
curl -X POST localhost:5678/webhook/ward-events -H "X-Ward-Secret: change-me-event" -H "Content-Type: application/json"   -d '{"event":"alert.critical","ts":"2026-10-06T10:00:00Z","data":{"patient_first_name":"Amira","bed":"C-12","kind":"news2","news2":8,"message":"SpO2 88%, HR 130","nurse_chat_ids":["<your chat id>"],"doctor_chat_id":"<your chat id>"}}'
```

The webhook always answers 200 (`responseMode: onReceived`). A wrong secret is silently dropped; check Executions in the UI.
