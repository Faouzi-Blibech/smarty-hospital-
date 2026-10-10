"use client";

// Sidebar "Health watch" (doctor, nurse, admin): the hospital city's forecast for the next days, the weather-health
// alerts with the at-risk patients this person can see (admin: a count only), and health news (WHO, Tunisian press).
// Texts come from the server in Arabic, French and English; the page shows the interface language.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { Key } from "@/i18n/messages";
import { getHealthWatch } from "@/lib/api";
import { tunisDay } from "@/lib/time";
import type { HealthAlert, HealthWatch, Tri } from "@/lib/types";
import styles from "./HealthWatchView.module.css";

const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toString());

export function HealthWatchView({ role }: { role: "doctor" | "nurse" | "admin" }) {
  const { t, lang } = useT();
  const [data, setData] = useState<HealthWatch | null>(null);
  const [failed, setFailed] = useState(false);
  const tri = (x: Tri | undefined) => (x ? x[lang] || x.en : "");

  useEffect(() => {
    getHealthWatch().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return <div className={styles.page}><p className={styles.muted}>{t("shared.hwUnavailable")}</p></div>;
  if (!data) return <div className={styles.page}><div className="skeleton" style={{ height: 240, borderRadius: 14 }} /></div>;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.h1}>{t("shared.navHealthWatch")}</h1>
        {data.demo ? <span className={styles.demo}>{t("shared.hwDemo", { name: data.demo })}</span> : null}
        <p className={styles.sub}>{t("shared.hwSub", { city: data.city })}</p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.h2}>{t("shared.hwForecast")}</h2>
        {!data.available ? <p className={styles.muted}>{t("shared.hwUnavailable")}</p> : null}
        <div className={styles.days}>
          {data.days.map((d) => (
            <div key={d.date} className={styles.day}>
              <b>{tunisDay(`${d.date}T12:00:00Z`, lang)}</b>
              <span className={styles.temp} dir="ltr">{n(d.tmin)}° / {n(d.tmax)}°</span>
              <span className={styles.muted}>{t("shared.hwFelt", { v: n(d.apparent_max) })}</span>
              <span className={styles.muted}>{t("shared.hwDust", { v: n(d.dust_max) })} · {t("shared.hwAqi", { v: n(d.aqi_max) })}</span>
              {d.precip ? <span className={styles.muted}>{t("shared.hwRain", { v: n(d.precip) })}</span> : null}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>{t("shared.hwAlerts")}</h2>
        {data.alerts.length === 0 ? <p className={styles.muted}>{t("shared.hwNoAlerts")}</p> : null}
        {data.alerts.map((a) => (
          <AlertRow key={`${a.id}-${a.date}`} a={a} role={role} tri={tri} />
        ))}
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>{t("shared.hwNews")}</h2>
        {!data.news?.length ? <p className={styles.muted}>{t("shared.hwNoNews")}</p> : null}
        <ul className={styles.news}>
          {(data.news ?? []).map((x) => (
            <li key={x.link}>
              <a href={x.link} target="_blank" rel="noopener noreferrer" dir="auto" lang={x.lang}>{x.title}</a>
              <span className={styles.muted}>
                {x.source}
                {x.published ? ` · ${tunisDay(x.published, lang)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.foot}>{t("shared.hwFoot")}</p>
    </div>
  );
}

function AlertRow({ a, role, tri }: { a: HealthAlert; role: "doctor" | "nurse" | "admin"; tri: (x: Tri | undefined) => string }) {
  const { t, lang } = useT();
  return (
    <article className={`${styles.alert} ${a.severity === "high" ? styles.high : styles.moderate}`}>
      <div className={styles.alertHead}>
        <span className={styles.sev}>{t(a.severity === "high" ? "shared.sevHigh" : "shared.sevModerate")}</span>
        <b dir="auto">{tri(a.title)}</b>
        <span className={styles.muted}>{tunisDay(`${a.date}T12:00:00Z`, lang)}</span>
      </div>
      <p dir="auto" className={styles.advice}>{tri(a.staff)}</p>
      <div className={styles.groups}>
        {a.groups.map((g) => (
          <span key={g} className={styles.group}>{t(`shared.grp_${g}` as Key)}</span>
        ))}
      </div>
      {role === "admin" ? (
        <span className={styles.muted}>{t("shared.hwAtRiskCount", { n: a.at_risk_count ?? 0 })}</span>
      ) : (
        <div className={styles.risk}>
          <span className={styles.riskHead}>{t("shared.hwAtRisk")}</span>
          {a.at_risk?.length ? (
            a.at_risk.map((p) => (
              <Link key={p.id} href={`/${role}/patients/${p.id}`} className={styles.patient} dir="auto">
                {p.name} · {p.groups.map((g) => t(`shared.grp_${g}` as Key)).join(", ")}
              </Link>
            ))
          ) : (
            <span className={styles.muted}>{t("shared.hwNoneAtRisk")}</span>
          )}
        </div>
      )}
    </article>
  );
}

export default HealthWatchView;
