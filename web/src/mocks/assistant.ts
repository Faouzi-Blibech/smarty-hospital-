// Mock patient assistant (POST /ai/assistant). Mirrors the design's `reply()` in
// Ward Patient.dc.html, using the api.md 1.4 intents. No diagnosis, ever.
import type { AssistantResponse } from "@/lib/types";

const AR = /[؀-ۿ]/;

export function mockAssistant(question: string): AssistantResponse {
  const s = question.toLowerCase();
  const ar = AR.test(question);

  if (/sadr|sadri|chest|thorac|poitrine|صدر|breath|respir|nitnaffes|تنفس|faint|evanoui/.test(s)) {
    return {
      intent: "urgent",
      source: "rules",
      sources: [],
      answer: ar ? "من فضلك اتصل بالممرضة الآن." : "Please call your nurse now. I’ve shown the button above.",
    };
  }
  if (/next|pill|dose|médicament|dwa|دواء|الدواء/.test(s)) {
    return {
      intent: "next_dose",
      source: "model",
      sources: [ar ? "المصدر: جدول أدويتك" : "Source: your medication schedule"],
      answer: ar ? "الدواء الجاي على الساعة 14:00: أموكسيسيلين 1 غ." : "Your next dose is at 14:00: Amoxicillin 1g.",
    };
  }
  if (/appoint|rendez|rdv|maw3ed|موعد/.test(s)) {
    return {
      intent: "next_visit",
      source: "model",
      sources: [ar ? "المصدر: مواعيدك" : "Source: your appointments"],
      answer: ar
        ? "موعدك القادم يوم الاثنين 12 أكتوبر على الساعة 10:00 مع الدكتور الطرابلسي."
        : "Your next appointment is Monday 12 Oct at 10:00 with Dr Trabelsi.",
    };
  }
  if (/vital|heart rate|pulse|oxygen|temperature|tension|نبض|حرارة/.test(s) && !/danger|normal|bad|grave|خطير/.test(s)) {
    return {
      intent: "my_vitals",
      source: "model",
      sources: [ar ? "المصدر: قياساتك" : "Source: your vitals"],
      answer: ar
        ? "آخر قياساتك: نبض القلب 96، الأكسجين 93%، الحرارة 37.4 درجة. الممرضة تتابعها."
        : "Your latest readings: heart rate 96 beats/min, oxygen 93%, temperature 37.4 °C. Your nurse is following them.",
    };
  }
  return {
    intent: "ask_staff",
    source: "rules",
    sources: [],
    answer: ar
      ? "ما نجمش نجاوب على أسئلة طبية. اسأل الممرضة ولا الطبيب."
      : "I can’t answer medical questions. Please ask your nurse or doctor.",
  };
}
