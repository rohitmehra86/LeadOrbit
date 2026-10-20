import type { SessionUser } from "@leadorbit/db";
import {
  getAssistantTool,
  hasPermission,
  planAssistantIntent,
  qualifyLeadDeterministic,
  type AssistantPlan,
  type AssistantToolResult,
  type MembershipRole,
} from "@leadorbit/domain";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getCrmStore } from "@/lib/tenancy/crm";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { createLaunchPack, publishLaunchPack } from "@/lib/launch/launch-pack";

export type AssistantChatRequest = {
  message: string;
  approve?: boolean;
  pendingPack?: {
    formId: string;
    pageId: string;
    pageSlug: string;
    campaignId: string;
  } | null;
};

export type AssistantChatResponse = {
  plan: AssistantPlan;
  status: "clarification" | "needs_approval" | "executed" | "denied" | "failed";
  results: AssistantToolResult[];
  pendingPack?: AssistantChatRequest["pendingPack"];
  report: string;
};

async function actorRole(
  actor: SessionUser,
  orgId: string,
): Promise<MembershipRole | "platform_admin"> {
  if (actor.isPlatformAdmin) return "platform_admin";
  const membership = await getTenancyStore().getMembership(actor.id, orgId);
  if (!membership) throw new Error("Not a member of this organization");
  return membership.role;
}

function canRun(
  role: MembershipRole | "platform_admin",
  permission: Parameters<typeof hasPermission>[1],
): boolean {
  if (role === "platform_admin") return true;
  return hasPermission(role, permission);
}

export async function runAssistantChat(
  actor: SessionUser,
  orgId: string,
  input: AssistantChatRequest,
): Promise<AssistantChatResponse> {
  const role = await actorRole(actor, orgId);
  const plan = planAssistantIntent({
    message: input.message,
    hasPendingPack: Boolean(input.pendingPack),
  });

  if (plan.needsClarification) {
    return {
      plan,
      status: "clarification",
      results: [],
      pendingPack: input.pendingPack ?? null,
      report: plan.needsClarification,
    };
  }

  for (const step of plan.steps) {
    const def = getAssistantTool(step.tool);
    if (!def) {
      return {
        plan,
        status: "failed",
        results: [],
        report: `Unknown tool: ${step.tool}`,
      };
    }
    if (!canRun(role, def.permission)) {
      return {
        plan,
        status: "denied",
        results: [
          {
            tool: step.tool,
            ok: false,
            detail: `Missing permission ${def.permission}`,
          },
        ],
        report: `Blocked: you need ${def.permission} to run ${step.tool}.`,
      };
    }
  }

  if (plan.requiresApproval && !input.approve) {
    return {
      plan,
      status: "needs_approval",
      results: [],
      pendingPack: input.pendingPack ?? null,
      report: `Plan ready (approval required): ${plan.summary}. Reply approve or click Approve to continue.`,
    };
  }

  const results: AssistantToolResult[] = [];
  let pendingPack = input.pendingPack ?? null;

  for (const step of plan.steps) {
    try {
      if (step.tool === "list_leads") {
        const leads = await getCrmStore().listLeads(actor, orgId);
        const limit = Number(step.args.limit ?? 10);
        const slice = leads.slice(0, limit).map((l) => ({
          id: l.id,
          name: l.fullName,
          email: l.email,
          score: l.score,
          status: l.status,
        }));
        results.push({
          tool: step.tool,
          ok: true,
          detail: `Found ${leads.length} leads (showing ${slice.length})`,
          data: { leads: slice, total: leads.length },
        });
      } else if (step.tool === "get_results_summary") {
        const leads = await getCrmStore().listLeads(actor, orgId);
        const campaigns = await getCampaignStore().listCampaigns(actor, orgId);
        const scored = leads.filter((l) => (l.score ?? 0) >= 45).length;
        results.push({
          tool: step.tool,
          ok: true,
          detail: `${leads.length} leads · ${scored} medium+ score · ${campaigns.length} campaigns`,
          data: {
            leadCount: leads.length,
            mediumPlus: scored,
            campaignCount: campaigns.length,
          },
        });
      } else if (step.tool === "qualify_lead") {
        const text = String(step.args.text ?? input.message);
        const q = qualifyLeadDeterministic({ text });
        results.push({
          tool: step.tool,
          ok: true,
          detail: `Score ${q.score} (${q.intent}) · missing: ${q.missingFields.join(", ") || "none"}`,
          data: { qualification: q },
        });
      } else if (step.tool === "create_launch_pack") {
        const pack = await createLaunchPack(actor, orgId, {
          goal: String(step.args.goal ?? input.message),
          location: (step.args.location as string | null) ?? null,
          offer: (step.args.offer as string | null) ?? null,
        });
        pendingPack = {
          formId: pack.formId,
          pageId: pack.pageId,
          pageSlug: pack.pageSlug,
          campaignId: pack.campaignId,
        };
        results.push({
          tool: step.tool,
          ok: true,
          detail: `Draft Launch Pack “${pack.name}” ready. Approve publish to go live.`,
          data: { pack },
        });
      } else if (step.tool === "publish_launch_pack") {
        if (!pendingPack) {
          results.push({
            tool: step.tool,
            ok: false,
            detail: "No pending Launch Pack to publish",
          });
        } else {
          const published = await publishLaunchPack(actor, orgId, pendingPack);
          results.push({
            tool: step.tool,
            ok: true,
            detail: `Live at ${published.publicPath}`,
            data: { pack: published },
          });
        }
      } else {
        results.push({
          tool: step.tool,
          ok: false,
          detail: "Tool not implemented",
        });
      }
    } catch (err) {
      results.push({
        tool: step.tool,
        ok: false,
        detail: err instanceof Error ? err.message : "Tool failed",
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const report = results.map((r) => `${r.ok ? "✓" : "✗"} ${r.tool}: ${r.detail}`).join("\n");

  return {
    plan,
    status: failed.length ? "failed" : "executed",
    results,
    pendingPack,
    report,
  };
}
