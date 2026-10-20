import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AppFrame } from "@/components/shell/app-frame";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <AppFrame email={user.email} isPlatformAdmin={user.isPlatformAdmin}>
      {children}
    </AppFrame>
  );
}
