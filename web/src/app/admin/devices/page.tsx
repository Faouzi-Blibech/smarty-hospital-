import { Suspense } from "react";
import { DevicesView } from "@/components/admin/DevicesView";

export const metadata = { title: "Beds & devices · Ward" };

export default function AdminDevicesPage() {
  return (
    <Suspense fallback={null}>
      <DevicesView />
    </Suspense>
  );
}
