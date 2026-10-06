import { Suspense } from "react";
import { OfferView } from "@/components/patient/OfferView";

export const metadata = { title: "Earlier appointment · Ward" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <OfferView id={id} />
    </Suspense>
  );
}
