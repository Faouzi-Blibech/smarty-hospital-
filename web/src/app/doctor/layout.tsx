import type { ReactNode } from "react";
import { RoleShell } from "@/components/RoleShell";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  return <RoleShell role="doctor">{children}</RoleShell>;
}
