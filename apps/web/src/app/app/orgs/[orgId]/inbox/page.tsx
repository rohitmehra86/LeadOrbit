import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getInboxStore } from "@/lib/tenancy/inbox";
import { Button } from "@leadorbit/ui";
import { InboxConsole } from "./inbox-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function InboxPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);
  const store = getInboxStore();
  const [conversations, channels, templates] = await Promise.all([
    store.listConversations(user, orgId),
    store.listChannelConnections(user, orgId),
    store.listTemplates(user, orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Communications</p>
          <h1 className="text-3xl font-semibold tracking-tight">Unified inbox</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            WhatsApp, Email, SMS, chat, Messenger, Instagram, and calling
            scaffolding. Outbound delivery stays pending_configuration without
            provider credentials — never faked as production success.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/workflows`}>
          <Button type="button">Workflows</Button>
        </Link>
      </div>
      <InboxConsole
        orgId={orgId}
        conversations={conversations}
        channels={channels}
        templates={templates}
      />
    </div>
  );
}
