import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { AssistantView } from "@/components/patient/AssistantView";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("patient.metaAssistant") };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssistantView />
    </Suspense>
  );
}
