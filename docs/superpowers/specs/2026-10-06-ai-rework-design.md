# AI rework: rules and trained models, optional open LLM

> **Date:** 2026-10-06 · **Owner:** Faouzi · **Contracts:** `api.md` 1.4, `data-model.md` 1.3
> Supersedes the AI parts of `2026-10-05-ward-foundation-design.md` (LLM-first with a fallback).

## Decisions

- **2026-10-05, user choice:** a hand-coded core plus an optional open LLM. Laya is integrated with our own classical ML. The paper digitizer is removed.
- **Rules and small trained models decide.** No LLM is needed for any module. `source` is `"model"` (a trained model decided), `"rules"` (deterministic only) or `"llm"` (the optional LLM wrote the text). Never `"fallback"`.
- **Anthropic is removed.** The optional LLM is an open model: Groq (`LLM_PROVIDER=groq`) or Ollama (`LLM_PROVIDER=local`). The default is `none`. It only rewrites the copilot summary, and everything it gets goes through `llm.strip_pii`.
- **Triage** = max(red-flag floor, trained char n-gram classifier, 2 if age ≥ 75). The model can raise urgency, never lower it. It dropped the `history` and `names` parameters. Without the model file it runs on rules alone.
- **Assistant:** a red-flag question returns the URGENT message with no model call. Otherwise the intent is the average of Laya (base model, zero-shot) and a trained char n-gram classifier; low confidence means `ask_staff`. Answers are templates filled from the caller's own record.
- **Copilot:** templated summary plus curated drug-interaction rules. An optional open LLM may rewrite the text.
- **Laya is an optional install** (`requirements-laya.txt`, needs torch). The first load takes about 50 s, so the router calls `laya_intent.preload()` at startup. Without Laya the assistant uses the classifier, and without both it uses keyword rules.
- **Laya fine-tuning was tried twice and not shipped.** Run 1 (4 epochs, lr 1e-4) left accuracy at 0.75. Run 2 (8 epochs, head lr 1e-3, frozen encoder) scored 0.694, below the base model. `laya_intent.py` runs base Laya.
- **Locked rules (CLAUDE.md):** every AI module works with no LLM; models are trained only on synthetic data; any optional LLM call goes through `llm.py`.

## Measured results

All numbers come from `backend/app/ai/models/*metrics.json`. The evaluation sets are hand-written, separate from the generated training rows, and small.

| Model | Eval set | Result |
|---|---|---|
| Triage classifier alone (trained on 450 rows) | 29 referrals | exact 0.966, within one 1.0, under-triaged 0, urgent missed 0 |
| Triage rules + classifier | same 29 | exact 0.966, within one 1.0, under-triaged 0, urgent missed 0 |
| Intent, char n-gram classifier (300 rows) | 36 questions | accuracy 0.75 |
| Intent, base Laya | same 36 | accuracy 0.75, median 356 ms on CPU |
| Intent, Laya fine-tuned head | same 36 | accuracy 0.694 (not shipped) |
| Intent, average of Laya and classifier | same 36 | accuracy 0.778 |

The one triage miss is "Headaches every day for a month, worse in the morning" (expected 3, got 4), an over-triage.

## How to retrain

From `backend/`:

```bash
pip install -r requirements-train.txt
python -m app.ai.training.make_data        # rewrites app/ai/data/*_train.v1.jsonl (synthetic templates)
python -m app.ai.training.train_textclf    # writes models/{triage,intent}.v1.json and *.metrics.json
# optional, about 30 min on CPU, needs requirements-laya.txt:
python -m app.ai.training.finetune_laya    # writes models/laya_intent_metrics.json
```

Scores are always measured on `app/ai/data/*_eval.v1.jsonl`, never on generated rows. A new model ships only if it beats the current one on that set.

## Limits

- Synthetic data only; the evaluation sets are 29 and 36 items, so the numbers are a sanity check and carry wide error bars.
- Not clinically validated and not medical-grade. A human confirms every AI output (`ai_suggested` + `human_confirmed_by`).
- Intent accuracy of 0.778 means roughly one question in four falls to "ask your nurse" or gets the wrong template. The red-flag rules run before any model for that reason.
- Laya needs about 50 s for its first load and a CPU with room for torch; it is optional.
