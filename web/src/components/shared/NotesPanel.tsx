"use client";

// Notes card: a draft box with "Add note" and the notes list (newest first).
// Shared by the doctor patient detail and the nurse views.
import { useState } from "react";
import { dayLabel, tunisTime } from "@/lib/time";
import type { Note, Role } from "@/lib/types";
import styles from "./NotesPanel.module.css";

/** Role chip colours (design `roleC`): [bg, fg]. */
const ROLE_CHIP: Partial<Record<Role, [string, string]>> = {
  nurse: ["var(--ai-bg)", "var(--news-normal-fg)"],
  doctor: ["var(--doctor-bg)", "var(--doctor-fg)"],
  admin: ["var(--chip)", "var(--text)"],
};

const ROLE_WORD: Record<Role, string> = { nurse: "Nurse", doctor: "Doctor", admin: "Admin", patient: "Patient" };

export interface NotesPanelProps {
  /** Newest first. */
  notes: Note[];
  /** Called with the trimmed text; the panel clears the draft when it resolves. */
  onAdd: (text: string) => Promise<unknown> | void;
  title?: string;
  placeholder?: string;
  /** Hint left of the button. */
  hint?: string;
  /** Reference "now" for the Today / weekday labels. */
  now?: Date;
  className?: string;
}

export function NotesPanel({
  notes,
  onAdd,
  title = "Notes",
  placeholder = "Add a note for the care team…",
  hint = "Visible to doctors and nurses",
  now,
  className,
}: NotesPanelProps) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAdd(text);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.compose}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={placeholder}
          dir="auto"
          aria-label="New note"
          className={styles.textarea}
        />
        <div className={styles.composeBar}>
          <span className={styles.hint}>{hint}</span>
          <button type="button" onClick={add} disabled={busy} className={styles.add}>
            Add note
          </button>
        </div>
      </div>
      {notes.map((n) => {
        const [bg, fg] = ROLE_CHIP[n.author_role] ?? ROLE_CHIP.admin!;
        return (
          <div key={n.id} className={styles.note}>
            <div className={styles.meta}>
              <span className={styles.who}>{n.author_name ?? n.author_id}</span>
              <span className={styles.role} style={{ background: bg, color: fg }}>
                {ROLE_WORD[n.author_role]}
              </span>
              <span className={styles.when}>
                {dayLabel(n.created_at, now)} {tunisTime(n.created_at)}
              </span>
            </div>
            <p dir="auto" className={styles.text}>
              {n.text}
            </p>
          </div>
        );
      })}
    </section>
  );
}

export default NotesPanel;
