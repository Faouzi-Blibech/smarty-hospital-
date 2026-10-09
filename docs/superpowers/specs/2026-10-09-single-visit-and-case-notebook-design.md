# Single-visit pathway and case notebook: design

> **Date:** 2026-10-09 · **Owner:** Faouzi (with Wali for schema + seed) · **Status:** draft for team review
> **Why:** feedback from the doctors who saw the demo on 2026-10-09 (below). Builds on api.md 1.7, data-model 1.3, n8n-webhooks 1.2.

## 1. What the doctors told us

1. **They already have a system like ours, for doctors only.** This matches the national picture:
   - The Ministry of Health's e-health programme (AFD-funded) deploys an electronic medical record, PACS imaging, digital archives and per-patient drug distribution in 15 public hospitals.
   - The 2025 "digital hospital" project runs telemedicine and remote imaging in 31 regional hospitals.
   - Sahetna.tn is the citizen portal (records, appointments) keyed on the national health identifier (INS), which every citizen is due to have by the end of 2026.
   
   **Our position:** we connect what exists rather than replace it. One shared record where patient, nurse, doctor and admin all act; the bedside medication loop; and the single-visit pathway below.
2. **They classify patients into groups with predefined scores.** We could not find a named national scale for Tunisia; hospitals describe "triage following international standards". The likely candidates:
   - French-influenced practice uses 5-level nurse triage scales: FRENCH (formerly CIMU) and the CCMU severity grades.
   - Ward scores such as NEWS2 (we compute it) and Glasgow.
   - GHM groups exist for hospital funding (French DRG), not for ordering patients.
   
   Our urgency 1–5 has the same shape as a 5-level scale but ranks referrals for an appointment and is not validated. **Action:** show the level of the scale the doctors use next to our score, through a mapping file, and mark the mapping "to confirm" until a doctor confirms it.
3. **Patients see the doctor twice:** once to be told which exams to do, once for the diagnosis and treatment. We want one visit.
4. **An assistant for each user.** For the doctor, something like NotebookLM: ask questions about one case and get answers grounded in that case's documents.

## 2. Goals and non-goals

**Goals**
- A request (appointment) gets a **suggested exam set** from rules. A doctor approves it. The patient does the exams before the visit. The department nurse uploads the results to the case. The doctor sees everything at the single visit.
- A **case notebook** for the doctor: questions about one patient, with answers built only from that patient's sources (notes, exam reports, prescriptions, vitals summary, referral) and every claim cited.
- Show the **hospital's triage scale label** next to our urgency.

**Non-goals (say so in the pitch)**
- No AI reading of images or lab values. We store and show results; a human reads them.
- No DICOM viewer. Uploads are PDF, JPEG or PNG; PACS integration is the production path.
- No general medical chatbot. The notebook answers only from the case's own sources.
- No booking automation tied to results. Staff still pick the slot; the UI shows whether results are in.

## 3. Locked rules that shape this

- **AI only suggests.** Exam sets are `suggested` until a doctor orders them. Notebook answers are stored with `ai_suggested` (including `source`) and `human_confirmed_by`.
- **Every AI module works with no LLM.**
  - Exam suggestions are rules (`source: "rules"`).
  - The notebook without an LLM returns the best-matching passages with citations (`source: "rules"`). With `LLM_PROVIDER=local|groq` it writes a short answer that may only cite those passages (`source: "llm"`). An invalid citation means we fall back to the passages.
- **Every LLM call goes through `app/ai/llm.py`**, which strips names, phones and IDs. Prompts live in `app/ai/prompts/`; rule lists in `app/ai/rules/`.
- **Every read of a patient's exams, results files or notebook writes `audit_log`.**
- **Synthetic data only.** The exam rules are illustrative and must be reviewed by the doctors before any real use.

## 4. Single-visit pathway

### Flow
1. **The patient (or admin) submits a request.** `POST /appointments` runs triage as today, then `suggest_exams()` matches the red flags and keywords against `rules/exam_bundles.v1.json`. It creates up to 4 `exam_orders` rows with `status: "suggested"` and `ai_suggested: {source: "rules", bundles: [...], reason}`.
2. **A doctor reviews the request** on the requests screen, ticks the exams to keep, can add one from the catalogue, and clicks **Order selected**.
   - The ticked rows become `ordered` (`human_confirmed_by` = the doctor, `ordered_at`); the other suggestions become `cancelled`.
   - The backend emits `exam.ordered` to n8n, which tells the patient where to go.
3. **The patient does the exams.** The nurse of the performing department (`staff.ward` = the exam's `department`, e.g. `Imaging`, `Laboratory`, `Cardiology`) opens **Exams** and uploads the file plus a short report line.
   - The order becomes `done` and an `exam_results` row points to the file in MinIO.
   - When every ordered exam of the appointment is done, the backend emits `exam.results_ready` to the ordering doctor.
4. **The admin books the slot.** The waitlist row shows `Exams 2/3`; booking stays possible either way.
5. **At the visit,** the doctor's patient page shows the exams with their files and reports, and the notebook can answer from them.

### Status machine (`exam_orders.status`)
`suggested → ordered → done`; `suggested|ordered → cancelled`. Any other move is a 409 `bad_status`.

### Access
| Who | Exam orders | Result files |
|---|---|---|
| Doctor | Read and order for any `requested` appointment (doctors already see the whole waitlist). Read for patients they attend, appointments they are booked on, or orders they placed | Same as reading |
| Nurse | Read their ward's patients, and orders whose `department` is their ward. Upload only for their department | Same as reading |
| Admin | Read counts (status only, no files) | — |
| Patient | Read their own `ordered`/`done` rows: label, department, status. Never `suggested`, never files | — |

### Storage
- MinIO is already in the stack (bucket `ward-docs`). Files go to key `exams/{exam_order_id}/{exam_result_id}/{safe_name}`.
- Allowed types: `application/pdf`, `image/jpeg`, `image/png`; maximum 15 MB.
- Downloads go through the API (auth + audit), never through public MinIO links.

## 5. Case notebook

- **Sources** for patient X, built on each question (no index to keep in sync):
  - the referral texts of their appointments
  - nurse and doctor notes
  - exam reports (the report line typed at upload, plus the exam label and date)
  - active prescriptions
  - a 24 h vitals summary (the copilot template)
  
  Each source has an `id` (e.g. `note:n-0003`), `kind`, `title`, `ts` and `text`.
- **Retrieval:**
  - Sources are split into passages of at most about 400 characters on sentence boundaries.
  - BM25 over tokens normalised like triage (accents and Arabic variants folded) gives the top 4 passages with a positive score.
  - Pure Python, no dependency.
- **Answer:**
  - **No LLM:** `answer` = "These passages from the record match your question. Read them before deciding." `citations` = the passages.
  - **LLM:** prompt `notebook.v1.md` with the numbered passages; schema `{answer: str, cited: list[int]}`. Valid only if `cited` is non-empty and every index is a provided passage; otherwise fall back to the no-LLM answer.
  - No passage matched: "Nothing in this record matches the question." with no citations.
- **Stored** as a `notebook_entries` row; the doctor can mark it reviewed. History newest first.
- **Who:** the attending doctor (`check_patient_access`, doctor role). Nurse handover summaries are later work.
- **Memory:** a local 7B model needs about 5–8 GB of RAM. Test on the demo laptop before promising the LLM mode; the no-LLM mode is the demo default.

## 6. Triage scale label

`rules/triage_scale.v1.json` maps our urgency to the hospital scale:

```json
{"name": "FRENCH", "confirmed": false, "levels": {"5": "Tri 1", "4": "Tri 2", "3": "Tri 3", "2": "Tri 4", "1": "Tri 5"}}
```

- `triage()` adds `scale: {"name", "level", "confirmed"}` to its output, so it is stored in `ai_suggested`.
- The waitlist shows "Tri 2 · FRENCH (to confirm)" until `confirmed` is true.
- Swapping the scale the doctors name is a JSON edit.

## 7. Contract changes (need the other side's 👍)

### data-model 1.4 (Wali)
New tables:
- **`exam_orders`**
  - `id` text PK `ex-0001`, `patient_id` FK, `appointment_id` FK null
  - `code` text, `label` text, `department` text
  - `status` text (`suggested|ordered|done|cancelled`)
  - `ai_suggested` jsonb null, `human_confirmed_by` FK users null
  - `ordered_at`, `done_at` timestamptz null, `created_at`
- **`exam_results`**
  - `id` text PK `er-0001`, `exam_order_id` FK, `patient_id` FK, `uploaded_by` FK users
  - `file_key` text, `file_name` text, `content_type` text, `size_bytes` int
  - `report_text` text default `''`, `created_at`
- **`notebook_entries`**
  - `id` text PK `nb-0001`, `patient_id` FK, `user_id` FK
  - `question` text, `ai_suggested` jsonb `{answer, citations, source}`, `human_confirmed_by` FK null, `created_at`

New role-matrix rows: "Exams" and "Notebook", as in section 4 → Access.

Seed: nurse `u-0006` (Imaging) and `u-0007` (Laboratory), password `ward1234`.

### api 1.8 (Faouzi)
- `GET /appointments/{id}/exams` · `GET /patients/{id}/exams` · `GET /exams?status=`
- `POST /appointments/{id}/exams/order {"exam_ids":[...]}` · `POST /exams {"patient_id","appointment_id"?,"code"}` · `POST /exams/{id}/cancel`
- `POST /exams/{id}/results` (multipart: `file`, `report_text`) · `GET /exam-results/{id}/file` · `GET /exams/catalogue`
- `POST /ai/notebook/{patient_id} {"question"}` · `GET /ai/notebook/{patient_id}` · `GET /ai/notebook/{patient_id}/sources` · `POST /ai/notebook/entries/{id}/review`
- `Appointment` gains `exams_total`, `exams_done`, `exams_suggested`.

### n8n-webhooks 1.3 (Faouzi)
- `exam.ordered`: `{appointment_id, patient_first_name, patient_telegram_chat_id, patient_email, exams:[{label, department}]}` → W7 tells the patient where to go.
- `exam.results_ready`: `{appointment_id, patient_first_name, doctor_id, doctor_name, doctor_email, doctor_chat_id}` → W8 tells the doctor.

## 8. Build order and demo slice

1. Finish `routers/ai.py` (in progress; the notebook routes go in that file).
2. **Plan A** (`plans/2026-10-09-single-visit-exams.md`): contracts → schema → rules → storage → routes → web. Demo slice: chest-pain request → ECG + troponin + chest X-ray suggested → doctor orders → imaging nurse uploads a PDF → doctor page shows it.
3. **Plan B** (`plans/2026-10-09-case-notebook.md`): retrieval → LLM answer → routes → web panel.
4. n8n W7/W8 with the other workflows.

If the pitch date is close, ship the Plan A demo slice and present Plan B as the roadmap.

## 9. Sources
- AFD, e-health in Tunisian public hospitals: https://www.afd.fr/fr/carte-des-projets/reequilibrer-lacces-aux-soins-en-deployant-une-strategie-e-sante-dans-les-hopitaux-publics
- Digital hospital plan 2026: https://fr.allafrica.com/stories/202603200480.html
- Sahetna.tn and INS: https://www.ecofinagency.com/news-digital/2207-57630-tunisia-finalizes-national-digital-health-record-portal-sahetna-tn
- Mongi Slim emergency triage: https://www.tunisienumerique.com/tunisie-italie-un-service-durgences-modernise-a-mongi-slim-grace-a-la-cooperation-italienne/
- FRENCH vs ESI triage scales: https://bmcemergmed.biomedcentral.com/articles/10.1186/s12873-022-00752-z
- GHM (French DRG) classification: https://www.atih.sante.fr/sites/default/files/public/content/1193/DOC3-SITE-MM.doc
