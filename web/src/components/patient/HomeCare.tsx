"use client";

// Patient / After discharge (/patient/home-care): follow-up progress, medicines at home and the
// nurses' desk. Data: getHomeCare (NOT IN CONTRACT). The design shows this screen on Thu 8 Oct, 18:30.
import { getHomeCare, getPatient } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { useT } from "@/i18n/I18nProvider";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { tunisDay } from "@/lib/time";
import type { HomeCarePlan } from "@/lib/types";
import { myPatientId, useLoad } from "./patient";
import { EmptyCard, PatientScreen, SkeletonCard } from "./PatientScreen";
import styles from "./Patient.module.css";

async function load() {
  const id = await myPatientId();
  // The care plan is optional: a failure (route not built yet) shows the "unavailable" card, not the error page.
  const [patient, plan] = await Promise.all([getPatient(id), getHomeCare(id).catch((): HomeCarePlan | null => null)]);
  return { patient, plan };
}

export function HomeCare() {
  const { t, lang } = useT();
  const flags = useDemoFlags();
  const res = useLoad(load);
  const data = flags.state === "loading" || flags.state === "error" ? null : res.data;
  const failed = flags.state === "error" || (!!res.error && !res.data);
  const plan = data?.plan;

  return (
    <PatientScreen time="18:30">
      <div className={`${styles.scroll} ${styles.homeCareBody}`}>
        {failed ? (
          <ErrorCard
            variant="patient"
            title={t("patient.errTitle")}
            message={t("patient.careLoadErr")}
            retryLabel={t("patient.tryAgain")}
            onRetry={flags.state === "error" ? undefined : res.retry}
          />
        ) : !data ? (
          <SkeletonCard />
        ) : !plan ? (
          <EmptyCard title={t("patient.noPlanTitle")}>{t("patient.noPlanText")}</EmptyCard>
        ) : (
          <>
            <div className={styles.titleBlock}>
              <h1 className={styles.h1Small}>
                {t("patient.welcomeHome")} <span dir="auto">{data.patient.first_name}</span>
              </h1>
              <span className={styles.sublineSmall}>
                {t("patient.dischargedFrom", { day: tunisDay(plan.discharged_at, lang), ward: plan.ward_label })}
              </span>
            </div>

            <section className={`${styles.card} ${styles.followCard}`}>
              <span className={styles.followEyebrow}>{t("patient.followUp")}</span>
              <h2 className={styles.followTitle}>{plan.follow_up.title}</h2>
              {plan.follow_up.steps.map((s, i) => (
                <div key={s.title} className={styles.step}>
                  <span className={`${styles.stepMark} ${styles[`step_${s.state}`]}`} aria-hidden="true">
                    {s.state === "done" ? "✓" : i + 1}
                  </span>
                  <span className={styles.stepText}>
                    <span className={styles.stepTitle}>{s.title}</span>
                    <span className={styles.stepSub}>{s.sub}</span>
                  </span>
                </div>
              ))}
            </section>

            <section className={`${styles.card} ${styles.homeMedsCard}`}>
              <h2 className={styles.cardTitle}>{t("patient.medsAtHome")}</h2>
              {plan.medicines.map((m) => (
                <div key={m.name} className={styles.homeMedRow}>
                  <span className={styles.homeMedWhen}>{m.when}</span>
                  <span className={styles.medText}>
                    <span className={styles.medName}>{m.name}</span>
                    <span className={styles.homeMedSub}>{m.sub}</span>
                  </span>
                </div>
              ))}
            </section>

            <section className={styles.deskCard}>
              <span className={styles.deskText}>{t("patient.deskText", { ward: plan.ward_label })}</span>
              <a href={`tel:${plan.desk_phone.replace(/\s+/g, "")}`} className={styles.deskBtn}>
                {t("patient.callPhone", { phone: plan.desk_phone })}
              </a>
              <span className={styles.emergency}>{t("patient.emergency", { n: plan.emergency_number })}</span>
            </section>
          </>
        )}
      </div>
    </PatientScreen>
  );
}

export default HomeCare;
