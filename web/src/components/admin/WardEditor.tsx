"use client";

// Inline ward editor for an active doctor or nurse on the Staff page (PATCH /users/{id}).
import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import page from "./AdminPage.module.css";
import styles from "./StaffView.module.css";
import { WARD_OPTIONS } from "./wards";

interface Props {
  current: string | null;
  busy: boolean;
  onSave: (ward: string | null) => void;
  onCancel: () => void;
}

export function WardEditor({ current, busy, onSave, onCancel }: Props) {
  const { t } = useT();
  const [ward, setWard] = useState(current ?? "");
  const known = WARD_OPTIONS.some((w) => w.ward === current);
  return (
    <span className={styles.wardEdit}>
      <select aria-label={t("accounts.wardEdit")} className={page.select} value={ward} onChange={(e) => setWard(e.target.value)}>
        <option value="">{t("accounts.wardNone")}</option>
        {current && !known ? <option value={current}>{current}</option> : null}
        {WARD_OPTIONS.map((w) => (
          <option key={w.ward} value={w.ward}>
            {t(w.label)}
          </option>
        ))}
      </select>
      <button type="button" className={page.btnPrimary} disabled={busy || ward === (current ?? "")} onClick={() => onSave(ward || null)}>
        {t("accounts.wardSave")}
      </button>
      <button type="button" className={page.btn} disabled={busy} onClick={onCancel}>
        {t("accounts.wardCancel")}
      </button>
    </span>
  );
}

export default WardEditor;
