import { Suspense } from "react";
import { NursePatientDetail } from "@/components/nurse/NursePatientDetail";

export const metadata = { title: "Patient · Ward" };

export default async function NursePatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <NursePatientDetail id={id} />
    </Suspense>
  );
}
