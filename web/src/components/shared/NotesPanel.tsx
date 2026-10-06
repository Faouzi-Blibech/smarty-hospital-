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
  /** Hint left of the button; null hides it and puts the button on the right (nurse design). */
  hint?: string | null;
  /** Reference "now" for the Today / weekday labels. */
  now?: Date;
  /** Textarea rows (default 2; the nurse design uses 3). */
  rows?: number;
  /** "doctor" (default): 14 px button with the hint bar. "nurse": 44 px button, 15 px text. */
  variant?: "doctor" | "nurse";
  /** Time label per note. Default "Today 09:05"; the nurse design shows "09:05" for today. */
  timeLabel?: (iso: string) => string;
  className?: string;
}

export function NotesPanel({
  notes,
  onAdd,
  title = "Notes",
  placeholder = "Add a note for the care team…",
  hint = "Visible to doctors and nurses",
  now,
  rows = 2,
  variant = "doctor",
  timeLabel,
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
    } catch {
      // Keep the draft; the caller shows the error (toast or inline).
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <h3 className={styles.title}>{title}</h3>
      <div className={`${styles.compose} ${variant === "nurse" ? styles.composeNurse : ""}`}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          dir="auto"
          aria-label="New note"
          className={styles.textarea}
        />
        <div className={styles.composeBar}>
          {hint !== null ? <span className={styles.hint}>{hint}</span> : null}
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className={`${styles.add} ${variant === "nurse" ? styles.addNurse : ""}`}
          >
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
                {timeLabel ? timeLabel(n.created_at) : `${dayLabel(n.created_at, now)} ${tunisTime(n.created_at)}`}
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
