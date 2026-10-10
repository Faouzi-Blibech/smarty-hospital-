"use client";

import { useCallback, useEffect, useState } from "react";
import { PendingList } from "@/components/admin/PendingList";
import page from "@/components/admin/AdminPage.module.css";
import { Toast, useToast } from "@/components/Toast";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { useT } from "@/i18n/I18nProvider";
import { disableUser, enableUser, getMyTeam } from "@/lib/api";
import type { UserAdmin } from "@/lib/types";
import styles from "./TeamView.module.css";

export function TeamView() {
  const { t } = useT();
  const [team, setTeam] = useState<UserAdmin[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, showToast] = useToast<string>(5000);

  const load = useCallback(() => {
    setFailed(false);
    getMyTeam().then(setTeam, () => setFailed(true));
  }, []);
  useEffect(load, [load]);

  async function toggle(u: UserAdmin) {
    setBusyId(u.id);
    try {
      const next = u.status === "active" ? await disableUser(u.id, { as: "doctor" }) : await enableUser(u.id, { as: "doctor" });
      setTeam((list) => (list ?? []).map((x) => (x.id === u.id ? { ...x, status: next.status } : x)));
      showToast(t(next.status === "active" ? "accounts.enabledToast" : "accounts.disabledToast", { name: u.name }));
    } catch {
      showToast(t("accounts.actionError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.h2}>{t("accounts.teamTitle")}</h2>
        <span className={styles.sub}>{t("accounts.teamSub")}</span>
      </div>

      <h3 className={styles.section}>{t("accounts.teamRequests")}</h3>
      <PendingList viewer="doctor" />

      <h3 className={styles.section}>{t("accounts.teamMembers")}</h3>
      {failed ? (
        <ErrorCard title={t("accounts.teamLoadError")} onRetry={load} />
      ) : !team ? (
        <div className="ward-skeleton" style={{ height: 90 }} aria-busy="true" />
      ) : (
        <div className={styles.members}>
          {team.length ? (
            team.map((u) => (
              <div key={u.id} className={styles.member}>
                <div className={styles.mwho}>
                  <span dir="auto" className={styles.mname}>
                    {u.name}
                  </span>
                  <span className={styles.memail}>{u.email}</span>
                </div>
                {u.status === "disabled" ? <span className={styles.off}>{t("accounts.statusDisabled")}</span> : null}
                {u.status === "active" || u.status === "disabled" ? (
                  <button type="button" className={page.btn} disabled={busyId === u.id} onClick={() => void toggle(u)}>
                    {u.status === "active" ? t("accounts.disable") : t("accounts.enable")}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className={styles.empty}>{t("accounts.teamEmpty")}</p>
          )}
        </div>
      )}
      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}

export default TeamView;
