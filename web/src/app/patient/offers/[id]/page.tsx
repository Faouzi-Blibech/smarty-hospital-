import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { OfferView } from "@/components/patient/OfferView";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("patient.metaOffer") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <OfferView id={id} />
    </Suspense>
  );
}
