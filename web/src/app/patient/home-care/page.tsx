import { Suspense } from "react";
import { HomeCare } from "@/components/patient/HomeCare";

export const metadata = { title: "Welcome home · Ward" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeCare />
    </Suspense>
  );
}
