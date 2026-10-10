import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { MedRound } from "@/components/nurse/MedRound";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: `${t("nurse.metaMeds")} · Ward` };
}

export default function NurseMedsPage() {
  return (
    <Suspense fallback={null}>
      <MedRound />
    </Suspense>
  );
}
