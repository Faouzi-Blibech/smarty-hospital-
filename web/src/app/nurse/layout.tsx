import type { ReactNode } from "react";
import { RoleShell } from "@/components/RoleShell";

export default function NurseLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell role="nurse" tablet>
      {children}
    </RoleShell>
  );
}
