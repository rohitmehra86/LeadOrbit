import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { AuthError } from "@leadorbit/db";
import { OrgNav } from "@/components/shell/org-nav";
import { UxModeProvider } from "@/components/shell/ux-mode";

type Props = {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
};

export default async function OrgShellLayout({ children, params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const store = getTenancyStore();
  let orgName = "Workspace";
  try {
    const org = await store.getOrganization(user, orgId);
    orgName = org.name;
  } catch (e) {
    if (e instanceof AuthError && e.code === "not_found") notFound();
    if (e instanceof AuthError && e.code === "forbidden") {
      return (
        <p className="p-8 text-red-300">
          Cross-tenant access denied. You are not a member of this organization.
        </p>
      );
    }
    throw e;
  }

  return (
    <UxModeProvider>
      <div className="lo-shell">
        <OrgNav orgId={orgId} orgName={orgName} email={user.email} />
        <main className="lo-shell-main">{children}</main>
      </div>
    </UxModeProvider>
  );
}
