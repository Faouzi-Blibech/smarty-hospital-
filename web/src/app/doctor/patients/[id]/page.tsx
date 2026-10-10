import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { PatientDetail } from "@/components/doctor/PatientDetail";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("doctor.metaPatient") };
}

export default async function DoctorPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PatientDetail id={id} />
    </Suspense>
  );
}
