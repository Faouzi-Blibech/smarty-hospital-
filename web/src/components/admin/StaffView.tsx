"use client";

// Admin / Staff accounts (/admin/staff) with the "Add staff" side panel.
// `?add=1` opens the panel pre-filled as in the design. There is no invite
// endpoint in api.md yet: in mock mode "Send invite" adds the row locally; in real
// mode it says invites aren't available instead of claiming one was sent.
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toast, useToast } from "@/components/Toast";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { getStaff } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { dayLabel, tunisTime, USE_MOCKS } from "@/lib/time";
import type { StaffMember } from "@/lib/types";
import page from "./AdminPage.module.css";
import styles from "./StaffView.module.css";

type StaffRole = StaffMember["role"];

const ROLE_LABEL: Record<StaffRole, string> = { doctor: "Doctor", nurse: "Nurse", admin: "Admin" };
const ROLE_COLORS: Record<StaffRole, [string, string]> = {
  doctor: ["var(--doctor-bg)", "var(--doctor-fg)"],
  nurse: ["var(--ai-bg)", "var(--news-normal-fg)"],
  admin: ["var(--segment)", "var(--text)"],
};
const WARDS = [
  { value: "Cardiology · Ward C", ward: "Cardiology" },
  { value: "Pediatrics", ward: "Pediatrics" },
  { value: "Pulmonology", ward: "Pulmonology" },
  { value: "Administration", ward: null },
];
const ROLE_HELP: Partial<Record<StaffRole, string>> = {
  nurse: "Nurses see live vitals, alerts, doses and notes for their ward. They can’t edit prescriptions.",
};
const DESIGN_DRAFT = { name: "Nour Hammami", email: "n.hammami@hr-ward.tn", role: "nurse" as StaffRole, scope: WARDS[0].value };
const EMPTY_DRAFT = { name: "", email: "", role: "nurse" as StaffRole, scope: WARDS[0].value };

const lastLogin = (iso: string | null) => (iso ? `${dayLabel(iso)} ${tunisTime(iso)}` : "Invited");

export function StaffView() {
  const flags = useDemoFlags();
  const params = useSearchParams();
  const startOpen = params.get("add") === "1";
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(startOpen);
  const [draft, setDraft] = useState(startOpen ? DESIGN_DRAFT : EMPTY_DRAFT);
  const [invalid, setInvalid] = useState(false);
  const [toast, showToast] = useToast<string>(5000);
  const nameRef = useRef<HTMLInputElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    setFailed(false);
    setStaff(null);
    getStaff()
      .then(setStaff)
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const state = flags.state === "empty" ? null : (flags.state ?? (failed ? "error" : staff == null ? "loading" : null));

  const openPanel = () => {
    setOpen(true);
    setInvalid(false);
    setTimeout(() => nameRef.current?.focus(), 0);
  };
  function close() {
    setOpen(false);
    addBtnRef.current?.focus();
  }

  const sendInvite = () => {
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name || !/^[^\s@]+@[^\s@]+$/.test(email)) {
      setInvalid(true);
      return;
    }
    if (!USE_MOCKS) {
      showToast("Invites aren’t available yet.");
      return;
    }
    const ward = WARDS.find((w) => w.value === draft.scope)?.ward ?? null;
    setStaff((s) => [
      ...(s ?? []),
      { id: `u-new-${(s?.length ?? 0) + 1}`, name, email, role: draft.role, ward, scope: draft.scope, last_login_at: null },
    ]);
    setDraft(EMPTY_DRAFT);
    setInvalid(false);
    setOpen(false);
    showToast(`Invite sent to ${email}.`);
  };

  const help = ROLE_HELP[draft.role];

  return (
    <div className={styles.frame}>
      <div className={`${page.page} ${styles.main}`}>
        <div className={page.head}>
          <div className={page.titles}>
            <h2 className={page.h2}>Staff</h2>
            <span className={page.sub}>Each role only sees what it needs</span>
          </div>
          <button
            ref={addBtnRef}
            type="button"
            className={`${page.btnPrimary} ${styles.addBtn}`}
            onClick={openPanel}
            aria-expanded={open}
            aria-controls="add-staff"
          >
            Add staff
          </button>
        </div>

        {state === "error" ? (
          <ErrorCard title="Couldn’t load staff accounts." onRetry={load} />
        ) : (
          <div className={`${styles.table} ${page.scrollX}`}>
            <div className={`${styles.grid} ${page.th}`}>
              <span>Name</span>
              <span>Role</span>
              <span>Ward / service</span>
              <span>Last login</span>
            </div>
            {state === "loading"
              ? [1, 2, 3, 4, 5, 6].map((k) => (
                  <div key={k} className={`${styles.grid} ${page.skelRow}`} aria-busy="true">
                    <span className="ward-skeleton" style={{ height: 14, width: "40%" }} />
                    <span className="ward-skeleton" style={{ height: 22, width: 60, borderRadius: 6 }} />
                    <span className="ward-skeleton" style={{ height: 14, width: 120 }} />
                    <span className="ward-skeleton" style={{ height: 14, width: 90 }} />
                  </div>
                ))
              : (staff ?? []).map((s) => (
                  <div key={s.id} className={`${styles.grid} ${page.tr}`}>
                    <span className={styles.who}>
                      <span dir="auto" className={styles.name}>
                        {s.name}
                      </span>
                      <span className={styles.email}>{s.email}</span>
                    </span>
                    <span className={styles.role} style={{ background: ROLE_COLORS[s.role][0], color: ROLE_COLORS[s.role][1] }}>
                      {ROLE_LABEL[s.role]}
                    </span>
                    <span className={styles.cell}>{s.scope}</span>
                    <span className={styles.cell}>{lastLogin(s.last_login_at)}</span>
                  </div>
                ))}
          </div>
        )}
      </div>

      {open ? (
        <aside id="add-staff" aria-labelledby="add-staff-title" className={styles.panel}>
          <div className={styles.panelHead}>
            <span id="add-staff-title" className={styles.panelTitle}>
              Add staff
            </span>
            <button type="button" aria-label="Close" className={styles.close} onClick={close}>
              ×
            </button>
          </div>
          <label className={page.field}>
            <span className={page.fieldLabel}>Full name</span>
            <input
              ref={nameRef}
              className={page.input}
              value={draft.name}
              autoComplete="off"
              aria-invalid={invalid && !draft.name.trim() ? true : undefined}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </label>
          <label className={page.field}>
            <span className={page.fieldLabel}>Work email</span>
            <input
              type="email"
              className={page.input}
              value={draft.email}
              autoComplete="off"
              aria-invalid={invalid && !/^[^\s@]+@[^\s@]+$/.test(draft.email.trim()) ? true : undefined}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </label>
          <div className={page.field}>
            <span id="role-label" className={page.fieldLabel}>
              Role
            </span>
            <div role="radiogroup" aria-labelledby="role-label" className={styles.segment}>
              {(["doctor", "nurse", "admin"] as StaffRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={draft.role === r}
                  className={`${styles.segBtn} ${draft.role === r ? styles.segOn : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, role: r }))}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <label className={page.field}>
            <span className={page.fieldLabel}>Ward</span>
            <span className={page.selectWrap}>
              <select
                className={page.select}
                value={draft.scope}
                onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.value }))}
              >
                {WARDS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.value === "Cardiology · Ward C" ? "Ward C · Cardiology" : w.value}
                  </option>
                ))}
              </select>
            </span>
          </label>
          {help ? <span className={page.help}>{help}</span> : null}
          {invalid ? (
            <span role="alert" className={styles.invalid}>
              Enter a full name and a work email.
            </span>
          ) : null}
          <button type="button" className={styles.send} onClick={sendInvite}>
            Send invite
          </button>
        </aside>
      ) : null}

      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}

export default StaffView;
