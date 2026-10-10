import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { HomeCare } from "@/components/patient/HomeCare";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("patient.metaHomeCare") };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeCare />
    </Suspense>
  );
}
