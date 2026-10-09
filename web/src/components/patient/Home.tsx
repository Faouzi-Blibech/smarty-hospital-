"use client";

// Patient / Home (/patient): greeting, today's medicines, yesterday's missed dose,
// the next appointment and "Ask a question". Plain words only: no NEWS2.
import Link from "next/link";
import { getDoses, getMyAppointments, getPatient, getPatientExams } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import type { Appointment, ExamOrder } from "@/lib/types";
import { now, tunisDate, tunisTime } from "@/lib/time";
import { ErrorCard } from "@/components/shared/ErrorCard";
import {
  bedLine,
  daysBetween,
  drugWord,
  greeting,
  longDay,
  MED_LABEL,
  medSource,
  medState,
  myPatientId,
  offlineSince,
  useLoad,
  useOffline,
} from "./patient";
import { EmptyCard, OfflineBanner, PatientScreen, SkeletonCard } from "./PatientScreen";
import styles from "./Patient.module.css";

async function loadHome() {
  const id = await myPatientId();
  // Appointments are optional here: if they fail (route not built yet), Home shows no "Next appointment"
  // card instead of failing the medicines.
  // Exams are optional too; the patient only ever sees ordered or done ones, never suggestions.
  const [patient, doses, appts, allExams] = await Promise.all([
    getPatient(id),
    getDoses(id),
    getMyAppointments(id).catch((): Appointment[] => []),
    getPatientExams(id).catch((): ExamOrder[] => []),
  ]);
  // "Before your visit": exams of a still-upcoming request (requested or confirmed), plus unattached ordered ones.
  const open = new Set(appts.filter((a) => a.status === "requested" || a.status === "confirmed").map((a) => a.id));
  const exams = allExams.filter((e) =>
    e.appointment_id ? open.has(e.appointment_id) && (e.status === "ordered" || e.status === "done") : e.status === "ordered",
  );
  return { patient, doses, appts, exams };
}

export function Home() {
  const flags = useDemoFlags();
  const offline = useOffline();
  const res = useLoad(loadHome);
  const ref = now();
  const todayIso = ref.toISOString();
  const today = tunisDate(todayIso);

  const data = flags.state === "error" || flags.state === "loading" ? null : res.data;
  const loading = flags.state === "loading" || (res.loading && !data);
  const failed = flags.state === "error" || (!!res.error && !data);

  const todays = (data?.doses ?? [])
    .filter((d) => tunisDate(d.scheduled_at) === today)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const meds = flags.state === "empty" ? [] : todays;
  const missedYesterday = (data?.doses ?? []).filter(
    (d) => d.status === "missed" && daysBetween(d.scheduled_at, todayIso) === 1,
  );
  const next = (data?.appts ?? []).find(
    (a) => a.status === "confirmed" && a.slot_at && Date.parse(a.slot_at) >= ref.getTime(),
  );
  const place = data ? bedLine(data.patient.bed, data.patient.ward) : null;

  return (
    <PatientScreen nav="home" apptHref={next ? `/patient/appointments/${next.id}` : undefined}>
      <div className={`${styles.scroll} ${styles.homeBody}`}>
        {offline ? <OfflineBanner since={offlineSince(res.loadedAt)} /> : null}
        <div className={styles.titleBlock}>
          <h1 className={styles.h1}>
            {greeting(ref)}
            {data ? <span dir="auto">, {data.patient.first_name}</span> : null}
          </h1>
          <span className={styles.subline}>{[place, longDay(todayIso)].filter(Boolean).join(" · ")}</span>
        </div>

        {failed ? (
          <ErrorCard
            variant="patient"
            title="Something went wrong."
            message="We couldn’t load your medicines."
            onRetry={flags.state === "error" ? undefined : res.retry}
          />
        ) : loading ? (
          <SkeletonCard />
        ) : meds.length === 0 ? (
          <EmptyCard title="No medicines today">Your doctor hasn’t added any. Ask your nurse if that seems wrong.</EmptyCard>
        ) : (
          <section className={`${styles.card} ${styles.medsCard}`} aria-labelledby="meds-title">
            <h2 id="meds-title" className={styles.cardTitle}>
              Today’s medicines
            </h2>
            {meds.map((d) => {
              const st = medState(d);
              return (
                <div key={d.id} className={styles.medRow}>
                  <span className={styles.medTime}>{d.time_of_day}</span>
                  <span className={styles.medText}>
                    <span className={styles.medName}>{d.meds.join(" + ")}</span>
                    <span className={styles.medSub}>{medSource(d)}</span>
                  </span>
                  <span className={`${styles.medPill} ${styles[`med_${st}`]}`}>{MED_LABEL[st]}</span>
                </div>
              );
            })}
          </section>
        )}

        {!failed && !loading && (data?.exams ?? []).length > 0 ? (
          <section className={`${styles.card} ${styles.medsCard}`} aria-label="Before your visit">
            <h2 className={styles.cardTitle}>Before your visit</h2>
            {(data?.exams ?? []).map((e) => (
              <div key={e.id} className={styles.medRow}>
                <span className={styles.medText}>
                  <span className={styles.medName}>{e.label}</span>
                  <span className={styles.medSub}>{e.department}</span>
                </span>
                <span className={`${styles.medPill} ${e.status === "done" ? styles.med_taken : styles.med_upcoming}`}>
                  {e.status === "done" ? "Done" : "To do"}
                </span>
              </div>
            ))}
            <p className={styles.examNote}>Do these before your appointment so the doctor can decide in one visit.</p>
          </section>
        ) : null}

        {!failed && !loading && missedYesterday.length > 0 ? (
          <div className={styles.missed}>
            <span className={styles.missedDot} />
            <span>
              <b>Missed yesterday:</b>{" "}
              {missedYesterday.map((d) => `${d.meds.map(drugWord).join(" + ")} at ${tunisTime(d.scheduled_at)}`).join(", ")}.
              Your nurse knows — no need to take extra.
            </span>
          </div>
        ) : null}

        {!failed && !loading && next?.slot_at ? (
          <Link href={`/patient/appointments/${next.id}`} className={styles.nextAppt}>
            <span className={styles.nextEyebrow}>Next appointment</span>
            <span className={styles.nextWhen}>
              {longDay(next.slot_at)} · {tunisTime(next.slot_at)}
            </span>
            <span className={styles.nextWho}>{[next.doctor_name, next.room].filter(Boolean).join(" · ")}</span>
            {next.patient_confirmed_at ? null : <span className={styles.nextCta}>Please confirm ›</span>}
          </Link>
        ) : null}

        <Link href="/patient/assistant" className={`${styles.outlineBtn} ${styles.ask}`}>
          Ask a question
        </Link>
      </div>
    </PatientScreen>
  );
}

export default Home;
