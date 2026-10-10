import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { PatientList } from "@/components/doctor/PatientList";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("doctor.metaPatients") };
}

export default function DoctorPatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientList />
    </Suspense>
  );
}
