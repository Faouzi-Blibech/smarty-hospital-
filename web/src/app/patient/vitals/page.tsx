import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { VitalsView } from "@/components/patient/VitalsView";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("patient.metaVitals") };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VitalsView />
    </Suspense>
  );
}
