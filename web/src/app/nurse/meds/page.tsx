import { Suspense } from "react";
import { MedRound } from "@/components/nurse/MedRound";

export const metadata = { title: "Med round · Ward" };

export default function NurseMedsPage() {
  return (
    <Suspense fallback={null}>
      <MedRound />
    </Suspense>
  );
}
