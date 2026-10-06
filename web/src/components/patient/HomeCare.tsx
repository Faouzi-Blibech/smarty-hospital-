"use client";

// Patient / After discharge (/patient/home-care): follow-up progress, medicines at home and the
// nurses' desk. Data: getHomeCare (NOT IN CONTRACT). The design shows this screen on Thu 8 Oct, 18:30.
import { getHomeCare, getPatient } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { tunisDay } from "@/lib/time";
import { myPatientId, useLoad } from "./patient";
import { PatientScreen, SkeletonCard } from "./PatientScreen";
import styles from "./Patient.module.css";

async function load() {
  const id = await myPatientId();
  const [patient, plan] = await Promise.all([getPatient(id), getHomeCare(id)]);
  return { patient, plan };
}

export function HomeCare() {
  const flags = useDemoFlags();
  const res = useLoad(load);
  const data = flags.state ? null : res.data;
  const failed = flags.state === "error" || (!!res.error && !res.data);
  const plan = data?.plan;

  return (
    <PatientScreen time="18:30">
      <div className={`${styles.scroll} ${styles.homeCareBody}`}>
        {failed ? (
          <ErrorCard
            variant="patient"
            title="Something went wrong."
            message="We couldn’t load your care plan."
            onRetry={flags.state === "error" ? undefined : res.retry}
          />
        ) : !data || !plan ? (
          <SkeletonCard />
        ) : (
          <>
            <div className={styles.titleBlock}>
              <h1 className={styles.h1Small}>
                Welcome home, <span dir="auto">{data.patient.first_name}</span>
              </h1>
              <span className={styles.sublineSmall}>
                Discharged {tunisDay(plan.discharged_at)} from {plan.ward_label}
              </span>
            </div>

            <section className={`${styles.card} ${styles.followCard}`}>
              <span className={styles.followEyebrow}>Follow-up</span>
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
              <h2 className={styles.cardTitle}>Medicines at home</h2>
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
              <span className={styles.deskText}>Questions about your care? {plan.ward_label} nurses’ desk, every day.</span>
              <a href={`tel:${plan.desk_phone.replace(/\s+/g, "")}`} className={styles.deskBtn}>
                Call {plan.desk_phone}
              </a>
              <span className={styles.emergency}>Emergency: call {plan.emergency_number}</span>
            </section>
          </>
        )}
      </div>
    </PatientScreen>
  );
}

export default HomeCare;
