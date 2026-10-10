# AI eval sets v2 (independent)

Hand-written, synthetic, never real patients. Written from the model descriptions only, without reading
`app/ai/data/*.jsonl`; then deduped against it (exact normalised match, char-3gram Jaccard >= 0.8, or containing a
whole `make_data` generator phrase) and refilled. Scored by `scripts/eval_ai.py`; ratcheted by `tests/test_ai_eval.py`.

## triage_eval.v2.jsonl
`{"text", "age", "expected", "lang", "category", "flag"}`. `expected` is our urgency (5 most urgent; Tri 1 = 5,
Tri 2 = 4, Tri 3 = 3, Tri 4 = 2, Tri 5 = 1). `lang`: en, fr, ar, darija_ar, darija_latin.
- 5: immediate threat to life (chest pain, stroke signs, severe bleeding, breathing, loss of consciousness,
  pregnancy bleeding, suicide/self-harm, overdose, anaphylaxis, seizure). 4: high fever in a baby, medication error.
- `red_flag_explicit`: the red-flag term is stated. `red_flag_paraphrase`: indirect or euphemistic; same label.
  `flag` is the red-flag id (4 cases per id), else null.
- `negation`: the symptom is denied and the visit is routine: 1 (paperwork) or 2 (renewal/follow-up).
- `routine`: no concern: 1 (certificate, check-up, records) or 2 (stable chronic, mild self-limiting symptom).
- `borderline`: no red-flag id; labelled as a triage nurse would, rounding up when unsure. 4 for possible time-critical
  problems (worst headache, hypertensive with headache, reduced fetal movement, head injury in a child, frail
  elderly fall or confusion, exertional chest tightness, black diabetic foot). 3 for needs-review-today. 2 for minor.
- Age 75+ routine cases are labelled 2 (the age rule).

## intent_eval.v2.jsonl
`{"text", "expected", "lang", "category"}`, 30 per intent and 30 per lang. `category`: direct, indirect, typo, short,
code_switch.
- `next_dose`: when to take, or whether they missed, medicine. `next_visit`: when the doctor or a consultation is.
- `my_vitals`: their heart rate, oxygen, temperature or latest readings.
- `urgent`: a patient-side emergency or call for a nurse now (pain, cannot breathe, bleeding, about to faint).
- `ask_staff`: anything else: diagnosis, prognosis, discharge, eating, insurance, parking, wifi, other patients.
- Scored on the shipped path (red-flag rules first, then `classify_intent`).
