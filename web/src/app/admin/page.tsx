import { Suspense } from "react";
import { Dashboard } from "@/components/admin/Dashboard";

export const metadata = { title: "Dashboard · Ward" };

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
