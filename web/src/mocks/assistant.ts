// Mock patient assistant (POST /ai/assistant, api.md 1.4). Mirrors backend/app/ai/assistant.py:
// red flags first (always `urgent` + the URGENT text, source "rules"), then simple keyword
// intents, answered only from the caller's own record (`AssistantContext`). No diagnosis, ever.
// English copy follows the design's `reply()` in Ward Patient.dc.html; Arabic is the design's.
import type { AssistantResponse } from "@/lib/types";
import { tunisTime } from "@/lib/time";

/** The only data the assistant may use: the patient's own doses, next visit and latest vitals. */
export interface AssistantContext {
  nextDose: { time: string; meds: string[] } | null;
  nextVisit: { slot_at: string; doctor_name: string | null } | null;
  latestVitals: { ts: string; hr: number | null; spo2: number | null; temp: number | null } | null;
}

/**
 * Urgent answer. Same meaning as backend assistant.py `URGENT`, without the device claim
 * (the bedside unit has no call button): prototype-honesty rule.
 */
export const URGENT = "This could be urgent. Tell any member of staff straight away.";
const URGENT_AR = "من فضلك اتصل بالممرضة الآن.";
const ASK_STAFF = "I can’t answer medical questions. Please ask your nurse or doctor.";
const ASK_STAFF_AR = "ما نجمش نجاوب على أسئلة طبية. اسأل الممرضة ولا الطبيب.";

const AR = /[؀-ۿ]/;

/** Same normalisation as backend triage._normalize: lowercase, no combining marks, ى→ي, ة→ه. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Copy of backend/app/ai/rules/red_flags.v1.json keywords (a string, or every term of an array),
// plus the design's extra short forms. Errs towards urgent.
const RED_FLAGS: (string | string[])[] = [
  // chest_pain
  "douleur thoracique", "douleurs thoraciques", "douleur poitrine", "chest pain", "ألم في الصدر", "وجع في صدري",
  "waja3 fi sadri", "sadri yoja3ni", ["douleur", "poitrine"], ["ألم", "صدر"], ["وجع", "صدر"], ["pain", "chest"],
  // stroke_signs
  "avc", "paralysie", "bouche deviee", "stroke", "شلل", "جلطة", "fama chalal",
  // severe_bleeding
  "hemorragie", "saignement abondant", "severe bleeding", "نزيف", "dam barcha",
  // breathing
  "dyspnee", "essoufflement", "difficulty breathing", "ضيق في التنفس", "ضيق التنفس", "ma najjamch nitnaffes",
  ["ضيق", "تنفس"], ["najjamch", "nitnaffes"], ["short", "breath"],
  // loss_of_consciousness
  "perte de connaissance", "syncope", "fainted", "إغماء", "ghabt",
  // pregnancy_bleeding, high_fever_child
  ["enceinte", "saignement"], ["pregnant", "bleeding"], ["حامل", "نزيف"],
  ["fievre", "nourrisson"], ["fievre", "bebe"], ["baby", "fever"], ["سخانة", "رضيع"],
  // design extras
  "sadr", "chest", "thorac", "poitrine", "صدر", "breath", "nitnaffes", "تنفس", "faint", "evanoui",
].map((k) => (Array.isArray(k) ? k.map(normalize) : normalize(k)));

export function isRedFlag(question: string): boolean {
  const t = normalize(question);
  return RED_FLAGS.some((k) => (Array.isArray(k) ? k.every((term) => t.includes(term)) : t.includes(k)));
}

// No bare "next": "next appointment" must reach VISIT (VISIT is also tested first).
const DOSE = /pill|dose|medic|comprim|traitement|dwa|دواء|حبوب/;
const VISIT = /appoint|rendez|rdv|visit|consultation|maw3ed|موعد/;
const VITALS = /vital|heart|pulse|pouls|oxygen|oxyg|temperature|tension|skhana|سخانه|حراره|نبض/;
/** "Is my heart rate dangerous?" asks for an interpretation: staff answer that. */
const JUDGEMENT = /danger|normal|bad|serious|grave|worried|ok\b|خطير|خطر/;

// Arabic display names for the mock record (synthetic).
const AR_MEDS: Record<string, string> = {
  "Amoxicillin 1g": "أموكسيسيلين 1 غ",
  "Paracetamol 500mg": "باراسيتامول 500 مغ",
  "Warfarin 5mg": "وارفارين 5 مغ",
  "Aspirin 100mg": "أسبرين 100 مغ",
};
const AR_DOCTORS: Record<string, string> = { "Dr Trabelsi": "الدكتور الطرابلسي" };
const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const AR_MONTHS = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Tunis calendar parts (UTC+1, no DST). */
function tunisParts(iso: string) {
  const d = new Date(Date.parse(iso) + 3_600_000);
  return { wd: d.getUTCDay(), day: d.getUTCDate(), mon: d.getUTCMonth() };
}

export function mockAssistant(question: string, ctx: AssistantContext): AssistantResponse {
  const ar = AR.test(question);
  const s = normalize(question);

  if (isRedFlag(question)) {
    return { intent: "urgent", source: "rules", sources: ["safety_rules"], answer: ar ? URGENT_AR : URGENT };
  }

  if (VISIT.test(s)) {
    const v = ctx.nextVisit;
    let answer: string;
    if (!v) {
      answer = ar
        ? "ما عندكش موعد مؤكد توة، المستشفى باش يتصل بيك."
        : "You have no confirmed appointment yet; the hospital will contact you.";
    } else {
      const p = tunisParts(v.slot_at);
      const t = tunisTime(v.slot_at);
      const doc = v.doctor_name ?? "";
      answer = ar
        ? `موعدك القادم يوم ${AR_DAYS[p.wd]} ${p.day} ${AR_MONTHS[p.mon]} على الساعة ${t}${doc ? ` مع ${AR_DOCTORS[doc] ?? doc}` : ""}.`
        : `Your next appointment is ${EN_DAYS[p.wd]} ${p.day} ${EN_MONTHS[p.mon]} at ${t}${doc ? ` with ${doc}` : ""}.`;
    }
    return { intent: "next_visit", source: "rules", sources: ["appointments"], answer };
  }

  if (DOSE.test(s)) {
    const d = ctx.nextDose;
    const answer = d
      ? ar
        ? `الدواء الجاي على الساعة ${d.time}: ${d.meds.map((m) => AR_MEDS[m] ?? m).join("، ")}.`
        : `Your next dose is at ${d.time}: ${d.meds.join(", ")}.`
      : ar
        ? "ما عندكش دواء آخر اليوم."
        : "You have no more doses scheduled today.";
    return { intent: "next_dose", source: "rules", sources: ["med_doses"], answer };
  }

  if (VITALS.test(s) && !JUDGEMENT.test(s)) {
    const v = ctx.latestVitals;
    const en: string[] = [];
    const arParts: string[] = [];
    if (v?.hr != null) (en.push(`heart rate ${v.hr} bpm`), arParts.push(`نبض القلب ${v.hr}`));
    if (v?.spo2 != null) (en.push(`oxygen ${v.spo2}%`), arParts.push(`الأكسجين ${v.spo2}%`));
    if (v?.temp != null) (en.push(`temperature ${v.temp} °C`), arParts.push(`الحرارة ${v.temp} درجة`));
    const answer = !v || en.length === 0
      ? ar
        ? "ما فماش قياسات اليوم."
        : "No readings yet today."
      : ar
        ? `آخر قياساتك (على الساعة ${tunisTime(v.ts)}): ${arParts.join("، ")}.`
        : `Your latest readings (at ${tunisTime(v.ts)}): ${en.join(", ")}.`;
    return { intent: "my_vitals", source: "rules", sources: ["vitals"], answer };
  }

  return { intent: "ask_staff", source: "rules", sources: [], answer: ar ? ASK_STAFF_AR : ASK_STAFF };
}
