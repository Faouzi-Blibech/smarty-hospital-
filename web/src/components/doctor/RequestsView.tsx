"use client";

// Doctor / Appointment requests (/doctor/requests): the shared Waitlist for the doctor's specialty.
// Mock: Cardiology (the design). Real: /me has no ward, so the specialty is the ward of the
// doctor's own patients (GET /patients); when that is unknown, all specialties are shown.
import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Waitlist } from "@/components/Waitlist";
import { getMyPatients } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { USE_MOCKS } from "@/lib/time";
import styles from "./RequestsView.module.css";

/** The signed-in doctor's specialty: undefined while loading, null when unknown. */
function useMySpecialty(): string | null | undefined {
  const [ward, setWard] = useState<string | null | undefined>(
    USE_MOCKS ? "Cardiology" : undefined,
  );
  useEffect(() => {
    if (USE_MOCKS) return;
    let alive = true;
    getMyPatients().then(
      (list) => alive && setWard(list.find((p) => p.ward)?.ward ?? null),
      () => alive && setWard(null),
    );
    return () => {
      alive = false;
    };
  }, []);
  return ward;
}

export function RequestsView() {
  const { t } = useT();
  const flags = useDemoFlags();
  const specialty = useMySpecialty();
  return (
    <div className={styles.page}>
      <div className={styles.titles}>
        <h2 className={styles.h2}>{t("doctor.requestsTitle")}</h2>
        <span className={styles.sub}>
          {t("doctor.requestsSub")}
        </span>
      </div>
      <div className={styles.waitlist}>
        {/* actor/actorId/doctorId are the mock-mode demo doctor; real mode books with the signed-in doctor. */}
        {specialty === undefined ? null : (
          <Waitlist
            caller="doctor"
            specialty={specialty ?? undefined}
            actor="Dr Trabelsi"
            actorId="u-0001"
            doctorId="u-0001"
            aiFallback={flags.aiFallback}
          />
        )}
      </div>
    </div>
  );
}

export default RequestsView;
