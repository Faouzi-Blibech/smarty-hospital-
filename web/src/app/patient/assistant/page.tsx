import { Suspense } from "react";
import { AssistantView } from "@/components/patient/AssistantView";

export const metadata = { title: "Assistant · Ward" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssistantView />
    </Suspense>
  );
}
