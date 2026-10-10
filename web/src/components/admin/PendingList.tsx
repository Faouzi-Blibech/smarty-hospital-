"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { Key } from "@/i18n/messages";
import { Toast, useToast } from "@/components/Toast";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { describeError, fmtWhen } from "@/lib/accountsUi";
import { approveUser, listUsers, rejectUser } from "@/lib/api";
import type { ApproveRequest, PendingUser } from "@/lib/types";
import { WARD_OPTIONS } from "./wards";
import page from "./AdminPage.module.css";
import styles from "./PendingList.module.css";

type Viewer = "admin" | "doctor";
type GrantRole = ApproveRequest["role"];

const ROLES: { value: GrantRole; label: Key }[] = [
  { value: "doctor", label: "admin.roleDoctor" },
  { value: "nurse", label: "admin.roleNurse" },
  { value: "admin", label: "admin.roleAdmin" },
];

interface RowProps {
  u: PendingUser;
  viewer: Viewer;
  busy: boolean;
  onApprove: (req: ApproveRequest) => void;
  onReject: () => void;
}

function Row({ u, viewer, busy, onApprove, onReject }: RowProps) {
  const { t, lang } = useT();
  const [role, setRole] = useState<GrantRole>("nurse");
  const [ward, setWard] = useState("");
  return (
    <div className={styles.row}>
      <div className={styles.who}>
        <span dir="auto" className={styles.name}>
          {u.name}
        </span>
        <span className={styles.email}>{u.email}</span>
        {u.note ? (
          <span dir="auto" className={styles.meta}>
            {u.note}
          </span>
        ) : null}
        <span className={styles.meta}>
          {u.requested_doctor_name ? `${t("accounts.pendingWorksWith", { doctor: u.requested_doctor_name })} · ` : ""}
          {t("accounts.pendingRequested", { when: fmtWhen(u.created_at, lang) })}
        </span>
      </div>
      <div className={styles.controls}>
        {viewer === "admin" ? (
          <>
            <select aria-label={t("accounts.approveAs")} className={page.select} value={role} onChange={(e) => setRole(e.target.value as GrantRole)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.label)}
                </option>
              ))}
            </select>
            <select aria-label={t("accounts.approveWard")} className={page.select} value={ward} onChange={(e) => setWard(e.target.value)}>
              <option value="">{t("accounts.wardNone")}</option>
              {WARD_OPTIONS.map((w) => (
                <option key={w.ward} value={w.ward}>
                  {t(w.label)}
                </option>
              ))}
            </select>
            <button type="button" className={page.btnPrimary} disabled={busy} onClick={() => onApprove({ role, ward: ward || null })}>
              {t("accounts.approve")}
            </button>
          </>
        ) : (
          <button type="button" className={page.btnPrimary} disabled={busy} onClick={() => onApprove({ role: "nurse" })}>
            {t("accounts.approveNurse")}
          </button>
        )}
        {u.status === "pending" ? (
          <button type="button" className={page.btn} disabled={busy} onClick={onReject}>
            {t("accounts.reject")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PendingList({ viewer, onChanged }: { viewer: Viewer; onChanged?: () => void }) {
  const { t } = useT();
  const [pending, setPending] = useState<PendingUser[] | null>(null);
  const [rejected, setRejected] = useState<PendingUser[]>([]);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, showToast] = useToast<{ text: string; tone: "ok" | "warn" }>(5000);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([listUsers("pending", { as: viewer }), listUsers("rejected", { as: viewer })])
      .then(([p, r]) => {
        setPending(p);
        setRejected(r);
      })
      .catch(() => setFailed(true));
  }, [viewer]);
  useEffect(load, [load]);

  async function act(u: PendingUser, run: () => Promise<unknown>, done: Key) {
    setBusyId(u.id);
    try {
      await run();
      showToast({ text: t(done, { name: u.name }), tone: "ok" });
      load();
      onChanged?.();
    } catch (err) {
      showToast({ text: t(describeError(err).key), tone: "warn" });
    } finally {
      setBusyId(null);
    }
  }

  if (failed) return <ErrorCard title={t("accounts.pendingLoadError")} onRetry={load} />;
  if (!pending) return <div className="ward-skeleton" style={{ height: 120 }} aria-busy="true" />;

  const rows = (list: PendingUser[]) =>
    list.map((u) => (
      <Row
        key={u.id}
        u={u}
        viewer={viewer}
        busy={busyId === u.id}
        onApprove={(req) => void act(u, () => approveUser(u.id, req, { as: viewer }), "accounts.approvedToast")}
        onReject={() => void act(u, () => rejectUser(u.id, { as: viewer }), "accounts.rejectedToast")}
      />
    ));

  return (
    <>
      <div className={styles.list}>{pending.length ? rows(pending) : <p className={styles.empty}>{t("accounts.pendingEmpty")}</p>}</div>
      {rejected.length ? (
        <>
          <h3 className={styles.heading}>{t("accounts.rejectedHeading")}</h3>
          <div className={styles.list}>{rows(rejected)}</div>
        </>
      ) : null}
      {toast ? <Toast tone={toast.tone}>{toast.text}</Toast> : null}
    </>
  );
}

export default PendingList;
