import { Suspense } from "react";
import { PatientsView } from "@/components/nurse/PatientsView";

export const metadata = { title: "Patients · Ward" };

export default function NursePatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientsView />
    </Suspense>
  );
}
