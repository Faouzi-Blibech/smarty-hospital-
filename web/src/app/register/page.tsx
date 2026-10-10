import { RegisterForm } from "@/components/auth/RegisterForm";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: `${t("auth.registerTitle")} · Ward` };
}

export default function RegisterPage() {
  return <RegisterForm />;
}
