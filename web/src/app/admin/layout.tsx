import type { ReactNode } from "react";
import { RoleShell } from "@/components/RoleShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RoleShell role="admin">{children}</RoleShell>;
}
