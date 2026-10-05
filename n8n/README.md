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

## Import

n8n UI → Workflows → Import from File → pick a JSON from `workflows/` → re-select the credentials → Activate.
