"use client";

// Patient / Assistant (/patient/assistant). Each question → POST /ai/assistant (api.md 1.4):
// `{answer, sources[], intent, source}`. Red flags come back as intent "urgent" (source "rules")
// and show the red "This could be urgent" block. The patient never sees a score or an AI badge.
// Nothing pages staff from here (no endpoint, and the bedside unit has no call button):
// "How to reach a nurse" shows a hint to ask any member of staff, without claiming anyone was told.
import { useEffect, useRef, useState } from "react";
import { askAssistant } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { useT } from "@/i18n/I18nProvider";
import type { Key } from "@/i18n/messages";
import type { AssistantIntent } from "@/lib/types";
import { Toast, useToast } from "@/components/Toast";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { CALL_NURSE_HINT } from "./patient";
import { PatientScreen } from "./PatientScreen";
import styles from "./Assistant.module.css";
import frame from "./Patient.module.css";

const AR = /[؀-ۿ]/;

type Msg =
  | { kind: "me"; id: number; text: string; ar: boolean }
  | { kind: "bot"; id: number; text: string; ar: boolean; intent: AssistantIntent; sources: string[] }
  | { kind: "error"; id: number; question: string };

/** Record names → the design's plain source line. Unknown keys are shown as they are. */
const SOURCE_LABEL: Record<string, [string, string]> = {
  med_doses: ["Source: your medication schedule", "المصدر: جدول أدويتك"],
  appointments: ["Source: your appointments", "المصدر: مواعيدك"],
  vitals: ["Source: your vitals", "المصدر: قياساتك"],
};

function sourceLine(sources: string[], ar: boolean): string | null {
  const keys = sources.filter((s) => s !== "safety_rules");
  if (keys.length === 0) return null;
  return keys.map((k) => (SOURCE_LABEL[k] ? SOURCE_LABEL[k][ar ? 1 : 0] : k)).join(" · ");
}

/** The design's opening conversation (START_CHAT). */
const START: Msg[] = [
  { kind: "me", id: 1, text: "When is my next pill?", ar: false },
  { kind: "bot", id: 2, text: "Your next dose is at 14:00: Amoxicillin 1g.", ar: false, intent: "next_dose", sources: ["med_doses"] },
  { kind: "me", id: 3, text: "وقتاش الدواء الجاي؟", ar: true },
  { kind: "bot", id: 4, text: "الدواء الجاي على الساعة 14:00: أموكسيسيلين 1 غ.", ar: true, intent: "next_dose", sources: ["med_doses"] },
  { kind: "me", id: 5, text: "Is my heart rate dangerous?", ar: false },
  { kind: "bot", id: 6, text: "I can’t answer medical questions. Please ask your nurse or doctor.", ar: false, intent: "ask_staff", sources: [] },
];

const CHIPS: Key[] = ["patient.chipPill", "patient.chipAppt", "patient.chipChest"];

export function AssistantView() {
  const { t } = useT();
  const flags = useDemoFlags();
  const [chat, setChat] = useState<Msg[]>(START);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [hint, showHint] = useToast<string>(6000);
  const seq = useRef(START.length);
  const listRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (first.current) {
      first.current = false;
      el.scrollTop = 0;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [chat, pending]);

  async function ask(raw: string, retryOf?: number) {
    const q = raw.trim();
    if (!q || pending) return;
    setInput("");
    setChat((c) => {
      const kept = retryOf ? c.filter((m) => m.id !== retryOf) : c;
      return retryOf ? kept : [...kept, { kind: "me", id: ++seq.current, text: q, ar: AR.test(q) }];
    });
    setPending(true);
    try {
      if (flags.state === "error") throw new Error("Demo: assistant unavailable");
      const r = await askAssistant(q);
      setChat((c) => [
        ...c,
        { kind: "bot", id: ++seq.current, text: r.answer, ar: AR.test(r.answer), intent: r.intent, sources: r.sources },
      ]);
    } catch {
      setChat((c) => [...c, { kind: "error", id: ++seq.current, question: q }]);
    } finally {
      setPending(false);
    }
  }

  const callNurse = () => showHint(t(CALL_NURSE_HINT));

  return (
    <PatientScreen>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <h1 className={styles.title}>{t("patient.assistantTitle")}</h1>
          <button type="button" className={styles.callBtn} onClick={callNurse}>
            {t("patient.reachNurse")}
          </button>
        </div>
        <span className={styles.headSub}>{t("patient.assistantSub")}</span>
      </div>

      <div ref={listRef} className={styles.list} aria-live="polite">
        {chat.map((m) => {
          if (m.kind === "error") {
            return (
              <div key={m.id} className={styles.item}>
                <ErrorCard
                  variant="patient"
                  title={t("patient.errTitle")}
                  message={t("patient.askErr")}
                  retryLabel={t("patient.tryAgain")}
                  onRetry={() => ask(m.question, m.id)}
                />
              </div>
            );
          }
          const me = m.kind === "me";
          const dir = m.ar ? "rtl" : "ltr";
          const src = m.kind === "bot" ? sourceLine(m.sources, m.ar) : null;
          return (
            <div key={m.id} className={`${styles.item} ${me ? styles.itemMe : styles.itemBot}`}>
              {m.kind === "bot" && m.intent === "urgent" ? (
                <div role="alert" className={styles.urgent}>
                  <span className={styles.urgentTitle}>{t("patient.urgentTitle")}</span>
                  <button type="button" className={styles.urgentBtn} onClick={callNurse}>
                    {t("patient.reachNurse")}
                  </button>
                  <span className={styles.urgentSub}>{t("patient.urgentSub")}</span>
                </div>
              ) : null}
              <div dir={dir} lang={m.ar ? "ar" : "en"} className={`${styles.bubble} ${me ? styles.bubbleMe : styles.bubbleBot}`}>
                {m.text}
              </div>
              {src ? (
                <span dir={dir} className={styles.source}>
                  <span className={styles.sourceDot} />
                  {src}
                </span>
              ) : null}
              {m.kind === "bot" && m.intent === "ask_staff" ? (
                <button type="button" className={styles.askNurse} onClick={callNurse}>
                  {t("patient.reachNurse")}
                </button>
              ) : null}
            </div>
          );
        })}
        {pending ? (
          <div className={`${styles.item} ${styles.itemBot}`}>
            <div className={`${styles.bubble} ${styles.bubbleBot} ${styles.typing}`} aria-busy="true" aria-label={t("patient.answering")}>
              …
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.chips}>
        {CHIPS.map((c) => (
          <button key={c} type="button" dir="auto" className={styles.chip} disabled={pending} onClick={() => ask(t(c))}>
            {t(c)}
          </button>
        ))}
      </div>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          dir="auto"
          placeholder={t("patient.askPlaceholder")}
          aria-label={t("patient.askLabel")}
          className={styles.input}
        />
        <button type="submit" aria-label={t("patient.send")} className={styles.send} disabled={pending}>
          ↑
        </button>
      </form>

      {hint ? (
        <Toast tone="warn" size="sm" placement="absolute" className={frame.phoneToast}>
          {hint}
        </Toast>
      ) : null}
    </PatientScreen>
  );
}

export default AssistantView;
