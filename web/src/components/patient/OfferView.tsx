"use client";

// Patient / Freed slot offer (/patient/offers/[id]). "Take this slot" → acceptOffer (NOT IN CONTRACT,
// mirrors the n8n backfill-accept: 409 slot_taken → "Sorry, this slot was just taken.").
// The demo link (mock mode only) forces the 409 (the design's "simulate “someone was faster”").
import Link from "next/link";
import { useState } from "react";
import { acceptOffer, ApiError, getMyAppointments, getOffer } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { tunisTime, USE_MOCKS } from "@/lib/time";
import type { Appointment, SlotOffer } from "@/lib/types";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { daysBetween, longDay, myPatientId, useLoad } from "./patient";
import { EmptyCard, PatientScreen, SkeletonCard } from "./PatientScreen";
import styles from "./Patient.module.css";

type Result = "booked" | "taken" | null;

async function loadOffer(id: string) {
  // Both calls are optional: a missing offer shows "no longer available", missing appointments drop "Instead of …".
  const [offer, list] = await Promise.all([
    getOffer(id).catch((): SlotOffer | null => null),
    myPatientId()
      .then(getMyAppointments)
      .catch((): Appointment[] => []),
  ]);
  return { offer, current: offer ? (list.find((a) => a.id === offer.appointment_id) ?? null) : null };
}

export function OfferView({ id }: { id: string }) {
  const flags = useDemoFlags();
  const res = useLoad(() => loadOffer(id), id);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState(false);

  const data = flags.state === "error" || flags.state === "loading" ? null : res.data;
  const offer = data?.offer;
  const current = data?.current;
  const shown: Result = result ?? (offer?.status === "accepted" ? "booked" : offer?.status === "taken" ? "taken" : null);

  async function take(simulateTaken = false) {
    if (!offer) return;
    setBusy(true);
    setSendError(false);
    try {
      await acceptOffer(offer.id, { simulateTaken });
      setResult("booked");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setResult("taken");
      else setSendError(true);
    } finally {
      setBusy(false);
    }
  }

  const when = offer ? `${longDay(offer.slot_at)} at ${tunisTime(offer.slot_at)}` : "";
  const currentDay = current?.slot_at ? longDay(current.slot_at) : null;

  if (offer && shown === "booked") {
    return (
      <PatientScreen time="09:40">
        <div role="status" className={`${styles.result} ${styles.resultOffer}`}>
          <span className={styles.resultIcon} aria-hidden="true">
            ✓
          </span>
          <h1 className={`${styles.resultTitle} ${styles.resultTitleBig}`}>Booked</h1>
          <span className={`${styles.resultText} ${styles.resultTextBig}`}>
            {when} with {offer.doctor_name}.
            {currentDay && result === "booked" ? ` Your ${currentDay.split(" ")[0]} appointment is cancelled for you.` : ""}
          </span>
          <span className={styles.flex} />
          <Link href="/patient" className={`${styles.primaryBtn} ${styles.fullWidth}`}>
            Done
          </Link>
        </div>
      </PatientScreen>
    );
  }

  if (offer && shown === "taken") {
    return (
      <PatientScreen time="09:40">
        <div role="status" className={`${styles.result} ${styles.resultOffer}`}>
          <span className={`${styles.resultIcon} ${styles.resultIconMuted}`} aria-hidden="true">
            –
          </span>
          <h1 className={`${styles.resultTitle} ${styles.resultTitleMid}`}>Sorry, this slot was just taken.</h1>
          <span className={`${styles.resultText} ${styles.resultTextBig}`}>
            Your request stays on the list.
            {current?.slot_at ? ` You still have ${currentDay} at ${tunisTime(current.slot_at)}.` : ""}
          </span>
          <span className={styles.flex} />
          <Link href="/patient" className={`${styles.primaryBtn} ${styles.fullWidth}`}>
            OK
          </Link>
        </div>
      </PatientScreen>
    );
  }

  const failed = flags.state === "error" || (!!res.error && !res.data);
  const sooner = offer && current?.slot_at ? daysBetween(offer.slot_at, current.slot_at) : 0;

  return (
    <PatientScreen time="09:40">
      <div className={styles.apptBody}>
        {failed ? (
          <ErrorCard
            variant="patient"
            title="Something went wrong."
            message="We couldn’t load this offer."
            onRetry={flags.state === "error" ? undefined : res.retry}
          />
        ) : !data ? (
          <SkeletonCard />
        ) : !offer ? (
          <EmptyCard title="This offer isn’t available">It may have been taken or withdrawn. Your current appointment stays as it is.</EmptyCard>
        ) : (
          <>
            <span className={styles.goodNews}>Good news</span>
            <h1 className={styles.offerTitle}>An earlier appointment is available</h1>
            <section className={styles.offerCard}>
              <span className={styles.offerWhen}>{when}</span>
              <span className={styles.offerWho}>
                with {offer.doctor_name} · {offer.room}
              </span>
              {currentDay ? (
                <span className={styles.offerInstead}>
                  Instead of {currentDay}
                  {sooner > 0 ? ` — ${sooner} day${sooner === 1 ? "" : "s"} sooner` : ""}
                </span>
              ) : null}
            </section>
            <span className={styles.offerText}>
              Someone cancelled. We’re offering it to people on the list, first to reply gets it.
            </span>
            {sendError ? (
              <ErrorCard variant="patient" title="Something went wrong." message="We couldn’t send your answer. Please try again." />
            ) : null}
            <span className={styles.flex} />
            <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => take()}>
              Take this slot
            </button>
            {USE_MOCKS ? (
              <button type="button" className={styles.demoLink} disabled={busy} onClick={() => take(true)}>
                Demo: simulate “someone was faster”
              </button>
            ) : null}
            <Link href="/patient" className={`${styles.secondaryBtn} ${styles.keepBtn}`}>
              {currentDay ? `Keep ${currentDay}` : "Keep my appointment"}
            </Link>
          </>
        )}
      </div>
    </PatientScreen>
  );
}

export default OfferView;
