import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { WaitlistView } from "@/components/admin/WaitlistView";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: `${t("admin.waitlist")} · Ward` };
}

export default function AdminWaitlistPage() {
  return (
    <Suspense fallback={null}>
      <WaitlistView />
    </Suspense>
  );
}
