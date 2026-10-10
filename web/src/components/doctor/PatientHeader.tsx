"use client";

// Patient detail header: name and facts, latest NEWS2 card, allergy card.
import { useT } from "@/i18n/I18nProvider";
import { deptLabel, news2Word } from "@/lib/labels";
import { level } from "@/lib/news2";
import { tunisDay, tunisTime } from "@/lib/time";
import type { Patient, Vital } from "@/lib/types";
import styles from "./PatientDetail.module.css";

const SEX: Record<Patient["sex"], "doctor.sexF" | "doctor.sexM"> = { F: "doctor.sexF", M: "doctor.sexM" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface PatientHeaderProps {
  patient: Patient;
  /** Oldest first; the first reading gives "up from N yesterday". */
  vitals: Vital[];
}

export function PatientHeader({ patient: p, vitals }: PatientHeaderProps) {
  const { t, lang } = useT();
  const score = p.latest_news2 ?? vitals[vitals.length - 1]?.news2 ?? 0;
  const lv = level(score);
  const latest = vitals[vitals.length - 1];
  const first = vitals.find((v) => v.news2 != null);
  const before = first && first !== latest ? first.news2 : null;
  const change =
    before == null
      ? ""
      : ` · ${before < score ? t("doctor.upFrom", { n: before }) : before > score ? t("doctor.downFrom", { n: before }) : t("doctor.sameAsYesterday")}`;
  const online = !!p.device_online;
  const facts = [String(p.age), t(SEX[p.sex]), deptLabel(p.ward, t), p.admitted_at ? t("doctor.admittedOn", { day: tunisDay(p.admitted_at, lang) }) : null].filter(Boolean);

  return (
    <section className={styles.header}>
      <div className={styles.identity}>
        <h2 dir="auto" className={styles.name}>
          {p.first_name} {p.last_name}
        </h2>
        <span className={styles.facts}>{facts.join(" · ")}</span>
        <div className={styles.chips}>
          <span className={styles.chip}>
            <b className={styles.strong}>{t("doctor.bedLabel", { bed: p.bed ?? "—" })}</b>
            {p.device_id ? (
              <>
                <span className={styles.sep}>·</span>
                <span className={styles.mono}>{p.device_id}</span>
                <span className={styles.online} style={{ color: online ? "var(--news-normal-fg)" : "var(--muted)" }}>
                  <span
                    className={styles.onlineDot}
                    style={online ? undefined : { background: "transparent", border: "2px solid var(--faint)" }}
                  />
                  {online ? t("doctor.online") : t("doctor.offline")}
                </span>
              </>
            ) : (
              <>
                <span className={styles.sep}>·</span>
                <span>{t("doctor.noBedsideUnit")}</span>
              </>
            )}
          </span>
          {p.attending_doctor_name ? (
            <span className={styles.chip}>
              {t("doctor.attending")} <b>{p.attending_doctor_name}</b>
            </span>
          ) : null}
          {p.nurse_name ? (
            <span className={styles.chip}>
              {t("doctor.nurse")} <b>{p.nurse_name}</b>
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.newsCard} style={{ background: lv.bg, color: lv.fg }}>
        <span className={styles.newsLabel}>{t("doctor.latestNews2")}</span>
        <span className={styles.newsValue}>
          <span className={styles.newsScore}>{score}</span>
          <span className={styles.newsWord}>{news2Word(lv.word, t)}</span>
        </span>
        <span className={styles.newsWhen}>
          {latest ? tunisTime(latest.ts) : "—"}
          {change}
        </span>
      </div>

      {p.allergies.length ? (
        <div role="note" aria-label={t("doctor.allergies")} className={styles.allergy}>
          <span className={styles.allergyLabel}>
            <span className={styles.diamond} />
            {t("doctor.allergies")}
          </span>
          <span className={styles.allergyName}>{p.allergies.map(cap).join(", ")}</span>
          {p.allergy_notes ? <span className={styles.allergyNote}>{p.allergy_notes}</span> : null}
        </div>
      ) : (
        <div role="note" aria-label={t("doctor.allergies")} className={`${styles.allergy} ${styles.noAllergy}`}>
          <span className={styles.allergyLabel}>{t("doctor.allergies")}</span>
          <span className={styles.allergyName}>{t("doctor.noneRecorded")}</span>
        </div>
      )}
    </section>
  );
}

export default PatientHeader;
