import { Suspense } from "react";
import { PatientList } from "@/components/doctor/PatientList";

export const metadata = { title: "My patients · Ward" };

export default function DoctorPatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientList />
    </Suspense>
  );
}
