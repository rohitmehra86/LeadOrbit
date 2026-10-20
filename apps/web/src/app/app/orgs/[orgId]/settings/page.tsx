import { redirect } from "next/navigation";

type Props = { params: Promise<{ orgId: string }> };

/** Settings lives on the org overview (members, branding, entitlements). */
export default async function SettingsRedirect({ params }: Props) {
  const { orgId } = await params;
  redirect(`/app/orgs/${orgId}`);
}
