import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getWorkflowStore } from "@/lib/tenancy/workflows";
import { Button } from "@leadorbit/ui";
import { WorkflowBuilder } from "./workflow-builder";

type Props = { params: Promise<{ orgId: string }> };

export default async function WorkflowsPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);
  const store = getWorkflowStore();
  const [workflows, enrollments, audit] = await Promise.all([
    store.listWorkflows(user, orgId),
    store.listEnrollments(user, orgId),
    store.listAudit(user, orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Automation</p>
          <h1 className="text-3xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Visual builder with triggers and actions. Publish enrolls work onto
            the durable worker queue — steps never run inside request handlers.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/inbox`}>
          <Button type="button">Open inbox</Button>
        </Link>
      </div>
      <WorkflowBuilder
        orgId={orgId}
        workflows={workflows}
        enrollments={enrollments}
        audit={audit}
      />
    </div>
  );
}
