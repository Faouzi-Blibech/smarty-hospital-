import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { AssistantWorkspace } from "@/components/shared/AssistantWorkspace";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("shared.metaAssistant") };
}

export default function DoctorAssistantPage() {
  return (
    <Suspense fallback={null}>
      <AssistantWorkspace role="doctor" />
    </Suspense>
  );
}
