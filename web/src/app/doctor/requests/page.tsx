import { Suspense } from "react";
import { RequestsView } from "@/components/doctor/RequestsView";

export const metadata = { title: "Appointment requests · Ward" };

export default function DoctorRequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsView />
    </Suspense>
  );
}
