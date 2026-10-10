import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { RequestsView } from "@/components/doctor/RequestsView";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("doctor.metaRequests") };
}

export default function DoctorRequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsView />
    </Suspense>
  );
}
