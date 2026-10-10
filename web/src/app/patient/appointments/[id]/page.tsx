import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { AppointmentView } from "@/components/patient/AppointmentView";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("patient.metaAppt") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <AppointmentView id={id} />
    </Suspense>
  );
}
