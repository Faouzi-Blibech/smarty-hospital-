import type { ReactNode } from "react";
import { PatientFrame } from "@/components/patient/PatientFrame";

export default function PatientLayout({ children }: { children: ReactNode }) {
  return <PatientFrame>{children}</PatientFrame>;
}
