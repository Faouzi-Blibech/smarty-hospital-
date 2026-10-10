"use client";

// Patient home: weather-health advice for the next days (GET /health-watch/me). Shows the alerts that concern this
// patient (their age or history puts them in a risk group) and any high-severity one. Nothing shows when calm or
// when the backend is not reachable.
import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { getMyHealthWatch } from "@/lib/api";
import { tunisDay } from "@/lib/time";
import type { HealthAlert } from "@/lib/types";
import styles from "./HealthBanner.module.css";

export function HealthBanner() {
  const { t, lang } = useT();
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);

  useEffect(() => {
    getMyHealthWatch()
      .then((w) => setAlerts(w.alerts.filter((a) => a.concerns_me || a.severity === "high").slice(0, 2)))
      .catch(() => setAlerts([]));
  }, []);

  if (!alerts.length) return null;
  return (
    <section className={styles.card} aria-label={t("shared.hwPatientTitle")}>
      <b className={styles.head}>{t("shared.hwPatientTitle")}</b>
      {alerts.map((a) => (
        <div key={`${a.id}-${a.date}`} className={`${styles.alert} ${a.severity === "high" ? styles.high : ""}`}>
          <span className={styles.title} dir="auto">
            {a.title[lang] || a.title.en} · {tunisDay(`${a.date}T12:00:00Z`, lang)}
          </span>
          {a.concerns_me ? <span className={styles.me}>{t("shared.hwForYou")}</span> : null}
          <span dir="auto" className={styles.advice}>{a.patient[lang] || a.patient.en}</span>
        </div>
      ))}
    </section>
  );
}

export default HealthBanner;
