"use client";

// Patient / Appointment (/patient/appointments/[id]) and Patient / Appointment · Confirmed.
// Confirm → POST /appointments/{id}/reply "confirm" → the full-screen confirmation.
// Cancel → reply "cancel" → the grey "Cancelled…" status. "Undo (demo)" (mock mode only) resets this view.
import Link from "next/link";
import { useState } from "react";
import { getMyAppointments, replyAppointment } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { tunisTime, USE_MOCKS } from "@/lib/time";
import type { Appointment } from "@/lib/types";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { dayMonthLong, longDay, myPatientId, offlineSince, useLoad, useOffline, weekday } from "./patient";
import { OfflineBanner, PatientScreen, SkeletonCard } from "./PatientScreen";
import styles from "./Patient.module.css";

/** The hospital is not in the record yet; the design's text. */
const HOSPITAL = "Hôpital Régional · Outpatients";

type View = "open" | "confirmed" | "yes" | "no";

async function loadAppointment(id: string): Promise<Appointment> {
  const list = await getMyAppointments(await myPatientId());
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error("Appointment not found");
  return a;
}

function initialView(a: Appointment): View {
  if (a.status === "cancelled") return "no";
  return a.patient_confirmed_at ? "yes" : "open";
}

/** A one-event .ics file for "Add to my calendar" (built in the browser, no network). */
function downloadIcs(a: Appointment) {
  if (!a.slot_at) return;
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(a.slot_at);
  const end = new Date(start.getTime() + 30 * 60_000);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ward//Patient//EN",
    "BEGIN:VEVENT",
    `UID:${a.id}@ward`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${[a.doctor_name, a.specialty].filter(Boolean).join(" · ") || "Appointment"}`,
    `LOCATION:${HOSPITAL}${a.room ? `, ${a.room.split(", ").pop()}` : ""}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ward-appointment-${a.id}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AppointmentView({ id }: { id: string }) {
  const flags = useDemoFlags();
  const offline = useOffline();
  const res = useLoad(() => loadAppointment(id), id);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState(false);

  const a = flags.state === "error" || flags.state === "loading" ? null : res.data;
  const current: View | null = a ? (view ?? initialView(a)) : null;

  async function reply(kind: "confirm" | "cancel") {
    if (!a) return;
    setBusy(true);
    setSendError(false);
    try {
      const updated = await replyAppointment(a.id, kind);
      res.setData(updated);
      setView(kind === "confirm" ? "confirmed" : "no");
    } catch {
      setSendError(true);
    } finally {
      setBusy(false);
    }
  }

  if (a && current === "confirmed") {
    const dayBefore = a.slot_at ? weekday(new Date(Date.parse(a.slot_at) - 86_400_000).toISOString()) : null;
    return (
      <PatientScreen icons={false} brand={false}>
        <div role="status" className={styles.result}>
          <span className={styles.resultIcon} aria-hidden="true">
            ✓
          </span>
          <h1 className={styles.resultTitle}>
            {a.slot_at ? `Thanks, see you on ${longDay(a.slot_at)} at ${tunisTime(a.slot_at)}.` : "Thanks, see you soon."}
          </h1>
          <span className={styles.resultText}>
            We’ll send one more reminder{dayBefore ? ` on ${dayBefore}` : ""} by Telegram and email.
          </span>
          <span className={styles.flex} />
          <button type="button" className={`${styles.primaryBtn} ${styles.fullWidth}`} onClick={() => downloadIcs(a)}>
            Add to my calendar
          </button>
          <Link href="/patient" className={`${styles.secondaryBtn} ${styles.fullWidth}`}>
            Back to home
          </Link>
        </div>
      </PatientScreen>
    );
  }

  const failed = flags.state === "error" || (!!res.error && !res.data);
  const loading = flags.state === "loading" || (res.loading && !res.data);

  return (
    <PatientScreen>
      <div className={styles.apptBody}>
        {offline ? <OfflineBanner since={offlineSince(res.loadedAt)} /> : null}
        <h1 className={styles.h1Small}>Your appointment</h1>
        {failed ? (
          <ErrorCard
            variant="patient"
            title="Something went wrong."
            message="We couldn’t load your appointment."
            onRetry={flags.state === "error" ? undefined : res.retry}
          />
        ) : loading || !a ? (
          <SkeletonCard />
        ) : (
          <>
            <section className={styles.apptCard}>
              <div className={styles.apptHead}>
                {a.slot_at ? (
                  <>
                    <span className={styles.apptWeekday}>{weekday(a.slot_at)}</span>
                    <span className={styles.apptDate}>{dayMonthLong(a.slot_at)}</span>
                    <span className={styles.apptTime}>{tunisTime(a.slot_at)}</span>
                  </>
                ) : (
                  <span className={styles.apptDate}>Date to be confirmed</span>
                )}
              </div>
              <div className={styles.apptFacts}>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>Doctor</span>
                  <b>{[a.doctor_name, a.specialty].filter(Boolean).join(" · ") || "To be confirmed"}</b>
                </div>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>Where</span>
                  <span>
                    {HOSPITAL}
                    {a.room ? `, ${a.room.split(", ").pop()}` : ""}
                  </span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>Bring</span>
                  <span>Your ID card and medicines list</span>
                </div>
              </div>
            </section>

            {sendError ? (
              <ErrorCard variant="patient" title="Something went wrong." message="We couldn’t send your answer. Please try again." />
            ) : null}

            {current === "open" ? (
              <div className={styles.apptActions}>
                <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => reply("confirm")}>
                  Confirm I’m coming
                </button>
                <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => reply("cancel")}>
                  Cancel
                </button>
                <span className={styles.apptNote}>If you cancel, your time goes to someone who is waiting.</span>
              </div>
            ) : (
              <div role="status" className={`${styles.apptDone} ${current === "yes" ? styles.apptDone_yes : styles.apptDone_no}`}>
                <span className={styles.apptDoneIcon} aria-hidden="true">
                  <span>{current === "yes" ? "✓" : "–"}</span>
                </span>
                <span className={styles.apptDoneMsg}>
                  {current === "yes"
                    ? a.slot_at
                      ? `Thanks, see you on ${longDay(a.slot_at)} at ${tunisTime(a.slot_at)}.`
                      : "Thanks, see you soon."
                    : "Cancelled. Your slot will go to someone who is waiting. Your request stays on the list."}
                </span>
                {USE_MOCKS ? (
                  <button type="button" className={styles.linkBtn} onClick={() => setView("open")}>
                    Undo (demo)
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </PatientScreen>
  );
}

export default AppointmentView;
