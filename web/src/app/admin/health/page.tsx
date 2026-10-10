import { getT } from "@/i18n/server";
import { HealthWatchView } from "@/components/shared/HealthWatchView";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("shared.metaHealthWatch") };
}

export default function AdminHealthWatchPage() {
  return <HealthWatchView role="admin" />;
}
