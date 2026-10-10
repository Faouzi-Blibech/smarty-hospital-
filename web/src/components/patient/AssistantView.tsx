"use client";

// Patient / Assistant (/patient/assistant). Each question → POST /ai/chat with the conversation so far:
// the answer comes only from the patient's own record, in the language of the question, with the record
// entries it used. Red flags come back with `urgent` (never sent to a model) and show the red block.
// Nothing pages staff from here (no endpoint, and the bedside unit has no call button):
// "How to reach a nurse" shows a hint to ask any member of staff, without claiming anyone was told.
import { useEffect, useRef, useState } from "react";
import { askChat } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { useT } from "@/i18n/I18nProvider";
import type { ChatTurn } from "@/lib/types";
import { Toast, useToast } from "@/components/Toast";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { CALL_NURSE_HINT } from "./patient";
import { PatientScreen } from "./PatientScreen";
import styles from "./Assistant.module.css";
import frame from "./Patient.module.css";

const AR = /[؀-ۿ]/;

type Msg =
  | { kind: "me"; id: number; text: string; ar: boolean }
  | { kind: "bot"; id: number; text: string; ar: boolean; urgent: boolean; sources: string[] }
  | { kind: "error"; id: number; question: string };

const MAX_TURNS = 6;

export function AssistantView() {
  const { t, lang } = useT();
  const flags = useDemoFlags();
  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [hint, showHint] = useToast<string>(6000);
  const seq = useRef(0);
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
      const history: ChatTurn[] = chat
        .filter((m): m is Exclude<Msg, { kind: "error" }> => m.kind !== "error")
        .slice(-MAX_TURNS)
        .map((m) => ({ role: m.kind === "me" ? "user" : "assistant", text: m.text }));
      const r = await askChat(q, { history, lang });
      setChat((c) => [
        ...c,
        { kind: "bot", id: ++seq.current, text: r.answer, ar: AR.test(r.answer), urgent: !!r.urgent,
          sources: [...new Set(r.citations.map((x) => x.title))] },
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
        {chat.length === 0 ? (
          <div className={`${styles.item} ${styles.itemBot}`}>
            <div dir="auto" className={`${styles.bubble} ${styles.bubbleBot}`}>{t("patient.chatIntro")}</div>
          </div>
        ) : null}
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
          const src = m.kind === "bot" && m.sources.length ? m.sources.join(" · ") : null;
          return (
            <div key={m.id} className={`${styles.item} ${me ? styles.itemMe : styles.itemBot}`}>
              {m.kind === "bot" && m.urgent ? (
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
