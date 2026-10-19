import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getAiStore } from "@/lib/tenancy/ai";
import { getKnowledgeStore } from "@/lib/tenancy/knowledge";
import { Button } from "@leadorbit/ui";
import { AiConsole } from "./ai-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function AiPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const ai = getAiStore();
  const kb = getKnowledgeStore();
  let personas = await ai.listPersonas(user, orgId);
  if (personas.length === 0) {
    personas = [await ai.ensureDefaultPersona(user, orgId)];
  }
  const [usage, turns, evals, documents, inventory, collections] =
    await Promise.all([
      ai.listUsage(user, orgId),
      ai.listTurns(user, orgId),
      ai.listEvals(user, orgId),
      kb.listDocuments(user, orgId),
      kb.listInventory(user, orgId),
      kb.listCollections(user, orgId),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Intelligence</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            AI agents & knowledge
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Deterministic qualification plus an OpenAI-compatible LLM gateway.
            Without API keys the gateway stays{" "}
            <code>pending_configuration</code> — never faked as live success.
            Inventory SQL is authoritative for prices.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/inbox`}>
          <Button type="button">Open inbox</Button>
        </Link>
      </div>
      <AiConsole
        orgId={orgId}
        gateway={ai.gatewayInfo()}
        personas={personas}
        usage={usage}
        turns={turns}
        evals={evals}
        documents={documents}
        inventory={inventory}
        collections={collections}
        vectorBackend={kb.backendStatus()}
      />
    </div>
  );
}
