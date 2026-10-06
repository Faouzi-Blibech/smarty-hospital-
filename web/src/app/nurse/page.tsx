import { Suspense } from "react";
import { WardBoard } from "@/components/nurse/WardBoard";

export const metadata = { title: "Ward board · Ward" };

export default function NurseBoardPage() {
  return (
    <Suspense fallback={null}>
      <WardBoard />
    </Suspense>
  );
}
