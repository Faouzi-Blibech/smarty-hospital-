"use client";

// AI assistant for one patient (doctor and nurse): POST /ai/chat with the conversation so far. Answers come only
// from this patient's record, in the language of the question, with the record passages they cite. Numbers the
// record does not contain are listed for the reader to check. The doctor can also attach a report to the case.
import { useRef, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { askChat, uploadReport } from "@/lib/api";
import type { ChatCitation, ChatResponse, ChatTurn } from "@/lib/types";
import styles from "./ChatPanel.module.css";

type Msg = { id: number; role: "user" | "assistant"; text: string; reply?: ChatResponse; error?: boolean };

const MAX_TURNS = 6;

export function ChatPanel({ patientId, role, canUpload = false }: { patientId: string; role: "doctor" | "nurse"; canUpload?: boolean }) {
  const { t, lang } = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    const history: ChatTurn[] = msgs.filter((m) => !m.error).slice(-MAX_TURNS).map((m) => ({ role: m.role, text: m.text }));
    setInput("");
    setMsgs((c) => [...c, { id: ++seq.current, role: "user", text: q }]);
    setBusy(true);
    scrollDown();
    try {
      const r = await askChat(q, { patientId, history, lang });
      setMsgs((c) => [...c, { id: ++seq.current, role: "assistant", text: r.answer, reply: r }]);
    } catch {
      setMsgs((c) => [...c, { id: ++seq.current, role: "assistant", text: t("shared.chatError"), error: true }]);
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  return (
    <section className={styles.card} aria-label={t("shared.chatTitle")}>
      <div className={styles.head}>
        <h3 className={styles.h3}>{t("shared.chatTitle")}</h3>
        <span className={styles.badge}>{t("shared.chatBadge")}</span>
        {msgs.length ? (
          <button type="button" className={styles.clear} onClick={() => setMsgs([])} disabled={busy}>
            {t("shared.chatClear")}
          </button>
        ) : null}
      </div>
      <p className={styles.sub}>{t(role === "doctor" ? "shared.chatSubDoctor" : "shared.chatSubNurse")}</p>

      {msgs.length || busy ? (
        <div ref={listRef} className={styles.list} aria-live="polite">
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} dir="auto" className={`${styles.bubble} ${styles.me}`}>{m.text}</div>
            ) : (
              <Answer key={m.id} msg={m} />
            ),
          )}
          {busy ? <div className={`${styles.bubble} ${styles.bot} ${styles.busy}`}>{t("shared.chatThinking")}</div> : null}
        </div>
      ) : null}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <textarea
          rows={2}
          dir="auto"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          placeholder={t(role === "doctor" ? "shared.chatPlaceholderDoctor" : "shared.chatPlaceholderNurse")}
          aria-label={t("shared.chatTitle")}
          className={styles.input}
          maxLength={1000}
        />
        <button type="submit" className={styles.send} disabled={busy || !input.trim()}>
          {t("shared.chatSend")}
        </button>
      </form>

      {role === "doctor" && canUpload ? <ReportUpload patientId={patientId} /> : null}
    </section>
  );
}

function Answer({ msg }: { msg: Msg }) {
  const { t } = useT();
  const r = msg.reply;
  return (
    <div className={styles.answer}>
      <div dir="auto" className={`${styles.bubble} ${styles.bot} ${msg.error ? styles.err : ""}`}>{msg.text}</div>
      {r && r.source === "rules" && r.citations.length ? <span className={styles.meta}>{t("shared.chatOffline")}</span> : null}
      {r?.unverified?.length ? (
        <span role="note" className={styles.warn}>{t("shared.chatUnverified", { values: r.unverified.join(", ") })}</span>
      ) : null}
      {r?.citations.length ? (
        <details className={styles.sources}>
          <summary>
            {t("shared.chatSources")} ({r.citations.length})
          </summary>
          {r.citations.map((c: ChatCitation, i) => (
            <div key={`${c.source_id}-${i}`} className={styles.cite}>
              <b dir="auto">
                {c.n ? `[${c.n}] ` : ""}
                {c.title}
              </b>
              <span dir="auto">{c.text}</span>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function ReportUpload({ patientId }: { patientId: string }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  async function send() {
    if (!file || state === "busy") return;
    setState("busy");
    try {
      await uploadReport(patientId, file, title.trim());
      setState("done");
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setState("error");
    }
  }

  return (
    <div className={styles.report}>
      <b className={styles.reportHead}>{t("shared.reportHeading")}</b>
      <span className={styles.meta}>{t("shared.reportHint")}</span>
      <div className={styles.reportRow}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setState("idle");
          }}
          aria-label={t("shared.reportHeading")}
        />
        <input
          dir="auto"
          className={styles.title}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("shared.reportTitlePlaceholder")}
        />
        <button type="button" className={styles.send} disabled={!file || state === "busy"} onClick={send}>
          {state === "busy" ? t("shared.reportUploading") : t("shared.reportUpload")}
        </button>
      </div>
      {state === "done" ? <span className={styles.ok}>{t("shared.reportDone")}</span> : null}
      {state === "error" ? <span className={styles.warn}>{t("shared.reportError")}</span> : null}
    </div>
  );
}

export default ChatPanel;
