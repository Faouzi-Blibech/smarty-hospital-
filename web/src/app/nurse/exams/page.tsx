import { Suspense } from "react";
import { ExamWorklist } from "@/components/nurse/ExamWorklist";

export const metadata = { title: "Exams · Ward" };

export default function NurseExamsPage() {
  return (
    <Suspense fallback={null}>
      <ExamWorklist />
    </Suspense>
  );
}
