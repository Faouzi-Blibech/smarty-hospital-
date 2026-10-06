import { Suspense } from "react";
import { VitalsView } from "@/components/patient/VitalsView";

export const metadata = { title: "My vitals · Ward" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VitalsView />
    </Suspense>
  );
}
