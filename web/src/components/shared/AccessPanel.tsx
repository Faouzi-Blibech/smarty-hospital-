"use client";

import { EnrollmentCode } from "./EnrollmentCode";
import { ShareWithDoctor } from "./ShareWithDoctor";

/** Enrollment code + doctor sharing for one patient. Mount only for the attending doctor or an admin. */
export function AccessPanel({ patientId, patientName, excludeIds }: { patientId: string; patientName: string; excludeIds: string[] }) {
  return (
    <>
      <EnrollmentCode patientId={patientId} patientName={patientName} />
      <ShareWithDoctor patientId={patientId} excludeIds={excludeIds} />
    </>
  );
}

export default AccessPanel;
