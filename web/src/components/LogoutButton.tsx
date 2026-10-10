"use client";

// Ends this device's session: best-effort POST /auth/logout, local clear, then the sign-in page (no ?expired notice).
import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { logout } from "@/lib/api";

export function LogoutButton({ className }: { className?: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    await logout();
    window.location.assign("/");
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={busy}>
      {t("shared.logout")}
    </button>
  );
}

export default LogoutButton;
