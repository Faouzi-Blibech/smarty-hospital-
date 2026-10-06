import { Suspense } from "react";
import { WaitlistView } from "@/components/admin/WaitlistView";

export const metadata = { title: "Waitlist · Ward" };

export default function AdminWaitlistPage() {
  return (
    <Suspense fallback={null}>
      <WaitlistView />
    </Suspense>
  );
}
