"use client";

// Ends this device's session: local clear, best-effort POST /auth/logout, then the sign-in page (no ?expired notice).
import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { hasSession, logout } from "@/lib/api";

export function LogoutButton({ className }: { className?: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  // Back after logging out can restore this page from the back/forward cache, patient data included: leave it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && !hasSession()) window.location.replace("/");
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

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
