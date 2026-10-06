"use client";

// Doctor / Patient detail (/doctor/patients/[id]).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LiveBanner } from "@/components/LiveBanner";
import { DosesTimeline } from "@/components/shared/DosesTimeline";
import { NotesPanel } from "@/components/shared/NotesPanel";
import { LIVE_JITTER, useLiveTick } from "@/components/shared/useLiveTick";
import { addNote, getDoses, getNotes, getPatient, getPrescriptions, getVitals } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { now, tunisTime, USE_MOCKS } from "@/lib/time";
import type { Dose, Note, Patient, Prescription, Vital } from "@/lib/types";
import { DailySummary } from "./DailySummary";
import { PatientHeader } from "./PatientHeader";
import { pausedAt } from "./PatientList";
import { Prescriptions } from "./Prescriptions";
import { VitalsCard } from "./VitalsCard";
import styles from "./PatientDetail.module.css";

/** The signed-in doctor in the demo (Dr Trabelsi). */
const DOCTOR_ID = "u-0001";
const DOCTOR_NAME = "Dr Trabelsi";

interface Data {
  patient: Patient;
  vitals: Vital[];
  prescriptions: Prescription[];
  doses: Dose[];
  notes: Note[];
}

export function PatientDetail({ id }: { id: string }) {
  const flags = useDemoFlags();
  const { sec, reading } = useLiveTick(flags.live);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [openedAt] = useState(() => tunisTime(now().toISOString()));

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getPatient(id), getVitals(id), getPrescriptions(id), getDoses(id), getNotes(id)])
      .then(([patient, vitals, prescriptions, doses, notes]) => setData({ patient, vitals, prescriptions, doses, notes }))
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(load, [load]);

  const refreshRx = useCallback(async () => {
    const [prescriptions, doses] = await Promise.all([getPrescriptions(id), getDoses(id)]);
    setData((d) => (d ? { ...d, prescriptions, doses } : d));
  }, [id]);

  const onAddNote = useCallback(
    async (text: string) => {
      const note = await addNote(id, text, { by: DOCTOR_ID });
      setData((d) => (d ? { ...d, notes: [note, ...d.notes] } : d));
    },
    [id],
  );

  const state = flags.state === "error" || failed ? "error" : flags.state === "loading" || !data ? "loading" : null;
  const name = data ? `${data.patient.first_name} ${data.patient.last_name}` : "";
  const jitter = flags.live && USE_MOCKS ? LIVE_JITTER[reading % LIVE_JITTER.length] : 0;

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link href="/doctor" className={styles.crumbLink}>
          My patients
        </Link>
        <span>/</span>
        <span dir="auto" className={styles.crumbHere}>
          {state ? "Patient" : name}
        </span>
        <span className={styles.spacer} />
        <span className={styles.audit}>
          <span className={styles.lock} />
          Access logged · {DOCTOR_NAME} · {openedAt}
        </span>
      </div>
      {!flags.live ? <LiveBanner>Chart frozen at {pausedAt()}. New readings will fill in automatically.</LiveBanner> : null}

      {state === "error" ? (
        <div className={styles.errorCard}>
          <div role="alert" className={styles.alert}>
            <span className={styles.alertIcon}>!</span>
            <div className={styles.alertText}>
              <b>Couldn’t load this patient.</b>
              <span>The server didn’t answer. Your data is safe — nothing was changed.</span>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={load}>
              Try again
            </button>
            <Link href="/doctor" className={styles.secondary}>
              Back to my patients
            </Link>
          </div>
        </div>
      ) : state === "loading" || !data ? (
        <div className={styles.skelCard} aria-busy="true">
          <span className="ward-skeleton" style={{ height: 34, width: 320 }} />
          <span className="ward-skeleton" style={{ height: 14, width: 260 }} />
          <span className="ward-skeleton" style={{ height: 120, width: "100%" }} />
          <span className="ward-skeleton" style={{ height: 120, width: "100%" }} />
        </div>
      ) : (
        <>
          <PatientHeader patient={data.patient} vitals={data.vitals} />
          <div className={styles.columns}>
            <div className={styles.col}>
              <VitalsCard vitals={data.vitals} live={flags.live} sec={sec} hrJitter={jitter} now={now()} />
              <Prescriptions
                patient={data.patient}
                prescriptions={data.prescriptions}
                actorId={DOCTOR_ID}
                onSaved={() => void refreshRx()}
              />
            </div>
            <div className={styles.col}>
              <DailySummary patientId={id} aiFallback={flags.aiFallback} actorId={DOCTOR_ID} />
              <DosesTimeline doses={data.doses} now={now()} />
              <NotesPanel notes={data.notes} onAdd={onAddNote} now={now()} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PatientDetail;
