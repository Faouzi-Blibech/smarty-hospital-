"use client";

// Patient / Freed slot offer (/patient/offers/[id]). "Take this slot" → acceptOffer (NOT IN CONTRACT,
// mirrors the n8n backfill-accept: 409 slot_taken → "Sorry, this slot was just taken.").
// The demo link (mock mode only) forces the 409 (the design's "simulate “someone was faster”").
import Link from "next/link";
import { useState } from "react";
import { acceptOffer, ApiError, getMyAppointments, getOffer } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { useT } from "@/i18n/I18nProvider";
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
  const { t, lang } = useT();
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

  const when = offer ? t("patient.whenAt", { day: longDay(offer.slot_at, lang), time: tunisTime(offer.slot_at) }) : "";
  const currentDay = current?.slot_at ? longDay(current.slot_at, lang) : null;

  if (offer && shown === "booked") {
    return (
      <PatientScreen time="09:40">
        <div role="status" className={`${styles.result} ${styles.resultOffer}`}>
          <span className={styles.resultIcon} aria-hidden="true">
            ✓
          </span>
          <h1 className={`${styles.resultTitle} ${styles.resultTitleBig}`}>{t("patient.booked")}</h1>
          <span className={`${styles.resultText} ${styles.resultTextBig}`}>
            {t("patient.bookedWith", { when, doctor: offer.doctor_name })}
            {currentDay && result === "booked" ? ` ${t("patient.bookedCancelled", { day: currentDay.split(" ")[0] })}` : ""}
          </span>
          <span className={styles.flex} />
          <Link href="/patient" className={`${styles.primaryBtn} ${styles.fullWidth}`}>
            {t("patient.done")}
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
          <h1 className={`${styles.resultTitle} ${styles.resultTitleMid}`}>{t("patient.takenTitle")}</h1>
          <span className={`${styles.resultText} ${styles.resultTextBig}`}>
            {t("patient.takenText")}
            {current?.slot_at ? ` ${t("patient.takenStill", { day: currentDay ?? "", time: tunisTime(current.slot_at) })}` : ""}
          </span>
          <span className={styles.flex} />
          <Link href="/patient" className={`${styles.primaryBtn} ${styles.fullWidth}`}>
            {t("patient.ok")}
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
            title={t("patient.errTitle")}
            message={t("patient.offerLoadErr")}
            retryLabel={t("patient.tryAgain")}
            onRetry={flags.state === "error" ? undefined : res.retry}
          />
        ) : !data ? (
          <SkeletonCard />
        ) : !offer ? (
          <EmptyCard title={t("patient.offerNoneTitle")}>{t("patient.offerNoneText")}</EmptyCard>
        ) : (
          <>
            <span className={styles.goodNews}>{t("patient.goodNews")}</span>
            <h1 className={styles.offerTitle}>{t("patient.offerTitle")}</h1>
            <section className={styles.offerCard}>
              <span className={styles.offerWhen}>{when}</span>
              <span className={styles.offerWho}>
                {t("patient.offerWith", { doctor: offer.doctor_name, room: offer.room })}
              </span>
              {currentDay ? (
                <span className={styles.offerInstead}>
                  {t("patient.insteadOf", { day: currentDay })}
                  {sooner > 0 ? ` — ${t(sooner === 1 ? "patient.soonerOne" : "patient.soonerMany", { n: sooner })}` : ""}
                </span>
              ) : null}
            </section>
            <span className={styles.offerText}>
              {t("patient.offerText")}
            </span>
            {sendError ? (
              <ErrorCard
                variant="patient"
                title={t("patient.errTitle")}
                message={t("patient.sendErr")}
                retryLabel={t("patient.tryAgain")}
              />
            ) : null}
            <span className={styles.flex} />
            <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => take()}>
              {t("patient.takeSlot")}
            </button>
            {USE_MOCKS ? (
              <button type="button" className={styles.demoLink} disabled={busy} onClick={() => take(true)}>
                {t("patient.demoFaster")}
              </button>
            ) : null}
            <Link href="/patient" className={`${styles.secondaryBtn} ${styles.keepBtn}`}>
              {currentDay ? t("patient.keepDay", { day: currentDay }) : t("patient.keepMine")}
            </Link>
          </>
        )}
      </div>
    </PatientScreen>
  );
}

export default OfferView;
