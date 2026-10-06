import { Suspense } from "react";
import { AlertsView } from "@/components/nurse/AlertsView";

export const metadata = { title: "Alerts · Ward" };

export default function NurseAlertsPage() {
  return (
    <Suspense fallback={null}>
      <AlertsView />
    </Suspense>
  );
}
