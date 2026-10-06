// Patient detail header: name and facts, latest NEWS2 card, allergy card.
import { level } from "@/lib/news2";
import { tunisDay, tunisTime } from "@/lib/time";
import type { Patient, Vital } from "@/lib/types";
import styles from "./PatientDetail.module.css";

const SEX: Record<Patient["sex"], string> = { F: "Female", M: "Male" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface PatientHeaderProps {
  patient: Patient;
  /** Oldest first; the first reading gives "up from N yesterday". */
  vitals: Vital[];
}

export function PatientHeader({ patient: p, vitals }: PatientHeaderProps) {
  const score = p.latest_news2 ?? vitals[vitals.length - 1]?.news2 ?? 0;
  const lv = level(score);
  const latest = vitals[vitals.length - 1];
  const first = vitals.find((v) => v.news2 != null);
  const before = first && first !== latest ? first.news2 : null;
  const change =
    before == null ? "" : before < score ? ` · up from ${before} yesterday` : before > score ? ` · down from ${before} yesterday` : " · same as yesterday";
  const online = !!p.device_online;
  const facts = [String(p.age), SEX[p.sex], p.ward, p.admitted_at ? `admitted ${tunisDay(p.admitted_at)}` : null].filter(Boolean);

  return (
    <section className={styles.header}>
      <div className={styles.identity}>
        <h2 dir="auto" className={styles.name}>
          {p.first_name} {p.last_name}
        </h2>
        <span className={styles.facts}>{facts.join(" · ")}</span>
        <div className={styles.chips}>
          <span className={styles.chip}>
            <b className={styles.strong}>Bed {p.bed ?? "—"}</b>
            {p.device_id ? (
              <>
                <span className={styles.sep}>·</span>
                <span className={styles.mono}>{p.device_id}</span>
                <span className={styles.online} style={{ color: online ? "var(--news-normal-fg)" : "var(--muted)" }}>
                  <span
                    className={styles.onlineDot}
                    style={online ? undefined : { background: "transparent", border: "2px solid var(--faint)" }}
                  />
                  {online ? "online" : "offline"}
                </span>
              </>
            ) : (
              <>
                <span className={styles.sep}>·</span>
                <span>No bedside unit</span>
              </>
            )}
          </span>
          {p.attending_doctor_name ? (
            <span className={styles.chip}>
              Attending: <b>{p.attending_doctor_name}</b>
            </span>
          ) : null}
          {p.nurse_name ? (
            <span className={styles.chip}>
              Nurse: <b>{p.nurse_name}</b>
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.newsCard} style={{ background: lv.bg, color: lv.fg }}>
        <span className={styles.newsLabel}>Latest NEWS2</span>
        <span className={styles.newsValue}>
          <span className={styles.newsScore}>{score}</span>
          <span className={styles.newsWord}>{lv.word}</span>
        </span>
        <span className={styles.newsWhen}>
          {latest ? tunisTime(latest.ts) : "—"}
          {change}
        </span>
      </div>

      {p.allergies.length ? (
        <div role="note" aria-label="Allergies" className={styles.allergy}>
          <span className={styles.allergyLabel}>
            <span className={styles.diamond} />
            Allergies
          </span>
          <span className={styles.allergyName}>{p.allergies.map(cap).join(", ")}</span>
          {p.allergy_notes ? <span className={styles.allergyNote}>{p.allergy_notes}</span> : null}
        </div>
      ) : (
        <div role="note" aria-label="Allergies" className={`${styles.allergy} ${styles.noAllergy}`}>
          <span className={styles.allergyLabel}>Allergies</span>
          <span className={styles.allergyName}>None recorded</span>
        </div>
      )}
    </section>
  );
}

export default PatientHeader;
