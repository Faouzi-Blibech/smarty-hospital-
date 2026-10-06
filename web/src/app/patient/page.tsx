import { Suspense } from "react";
import { Home } from "@/components/patient/Home";

export const metadata = { title: "Home · Ward" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}
