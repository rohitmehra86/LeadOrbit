import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Button } from "@leadorbit/ui";

type Props = { params: Promise<{ orgId: string }> };

export default async function SalesSimplePage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="lo-panel">
      <header className="lo-panel-head">
        <h1>Sales & Appointments</h1>
        <p>
          Book meetings and manage pipeline. Google/Microsoft calendar sync and telephony stay{" "}
          <strong>blocked until provider credentials</strong> are configured.
        </p>
      </header>
      <div className="lo-card-actions">
        <Link href={`/app/orgs/${orgId}/calendar`}>
          <Button type="button">Open calendar & booking</Button>
        </Link>
        <Link href={`/app/orgs/${orgId}/crm`}>
          <Button type="button">Open deals board</Button>
        </Link>
      </div>
    </div>
  );
}
