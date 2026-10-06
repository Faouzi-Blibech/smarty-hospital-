import { Suspense } from "react";
import { PatientDetail } from "@/components/doctor/PatientDetail";

export const metadata = { title: "Patient · Ward" };

export default async function DoctorPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PatientDetail id={id} />
    </Suspense>
  );
}
