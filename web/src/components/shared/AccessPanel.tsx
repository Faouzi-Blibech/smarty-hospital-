"use client";

import { PatientResetCode } from "./PatientResetCode";
import { ShareWithDoctor } from "./ShareWithDoctor";

/** Password-reset code + doctor sharing for one patient. Mount only for the attending doctor or an admin. */
export function AccessPanel({ patientId, patientName, excludeIds }: { patientId: string; patientName: string; excludeIds: string[] }) {
  return (
    <>
      <PatientResetCode patientId={patientId} patientName={patientName} />
      <ShareWithDoctor patientId={patientId} excludeIds={excludeIds} />
    </>
  );
}

export default AccessPanel;
