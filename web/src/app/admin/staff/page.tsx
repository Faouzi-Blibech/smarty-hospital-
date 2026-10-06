import { Suspense } from "react";
import { StaffView } from "@/components/admin/StaffView";

export const metadata = { title: "Staff · Ward" };

export default function AdminStaffPage() {
  return (
    <Suspense fallback={null}>
      <StaffView />
    </Suspense>
  );
}
