import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { Home } from "@/components/patient/Home";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("patient.metaHome") };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}
