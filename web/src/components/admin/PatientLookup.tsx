"use client";

import { useState, type FormEvent } from "react";
import { AccessPanel } from "@/components/shared/AccessPanel";
import { useT } from "@/i18n/I18nProvider";
import { searchPatients, type PatientListItem } from "@/lib/api";
import page from "./AdminPage.module.css";

export function PatientLookup() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PatientListItem[] | null>(null);
  const [selected, setSelected] = useState<PatientListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      const list = await searchPatients(q);
      setRows(list);
      if (list.length === 0) setError(t("accounts.lookupNotFound"));
    } catch {
      setRows(null);
      setError(t("accounts.actionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={page.page}>
      <div className={page.head}>
        <div className={page.titles}>
          <h2 className={page.h2}>{t("accounts.lookupTitle")}</h2>
          <span className={page.sub}>{t("accounts.lookupSub")}</span>
        </div>
      </div>
      <form onSubmit={search} style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <label className={page.field}>
          <span className={page.fieldLabel}>{t("accounts.lookupLabel")}</span>
          <input dir="auto" placeholder="p-0001" className={page.input} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="submit" className={page.btnPrimary} disabled={busy}>
          {t("accounts.lookupGo")}
        </button>
      </form>
      {error ? <span role="alert">{error}</span> : null}
      {rows && rows.length > 0 && !selected
        ? rows.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span dir="auto">
                {p.first_name} {p.last_name}
              </span>
              <span dir="ltr" className={page.sub}>
                {p.id}
              </span>
              <button type="button" className={page.btn} onClick={() => setSelected(p)}>
                {t("accounts.lookupGo")}
              </button>
            </div>
          ))
        : null}
      {selected ? (
        <>
          <h3 dir="auto" className={page.h2} style={{ fontSize: 28 }}>
            {selected.first_name} {selected.last_name}
          </h3>
          <AccessPanel patientId={selected.id} patientName={`${selected.first_name} ${selected.last_name}`} excludeIds={[]} />
        </>
      ) : null}
    </div>
  );
}

export default PatientLookup;
