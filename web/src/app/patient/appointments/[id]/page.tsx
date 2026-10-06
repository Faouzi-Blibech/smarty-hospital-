import { Suspense } from "react";
import { AppointmentView } from "@/components/patient/AppointmentView";

export const metadata = { title: "Your appointment · Ward" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <AppointmentView id={id} />
    </Suspense>
  );
}
