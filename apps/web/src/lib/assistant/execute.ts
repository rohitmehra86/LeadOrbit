import { getAuthMode, type SessionUser } from "@leadorbit/db";
import {
  getAssistantTool,
  hasPermission,
  planAssistantIntent,
  qualifyLeadDeterministic,
  type AssistantPlan,
  type AssistantToolResult,
  type LeadStatus,
  type MembershipRole,
} from "@leadorbit/domain";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getDomainCrm } from "@/lib/tenancy/crm";
import { getDomainCampaigns } from "@/lib/tenancy/campaigns";
import { getCalendarStore } from "@/lib/tenancy/calendar";
import { getSupabaseCrmStore } from "@/lib/tenancy/supabase-crm";
import { getBillingStore } from "@/lib/tenancy/billing";
import { createLaunchPack, publishLaunchPack } from "@/lib/launch/launch-pack";
import {
  approveMetaAiLaunch,
  prepareMetaAiLaunch,
} from "@/lib/meta/meta-ai-launch";
import type { MetaLaunchPlan } from "@leadorbit/domain";
import { AuthError } from "@leadorbit/db";

export type AssistantChatRequest = {
  message: string;
  approve?: boolean;
  pendingPack?: {
    formId: string;
    pageId: string;
    pageSlug: string;
    campaignId: string;
  } | null;
  pendingMetaPlan?: {
    plan: MetaLaunchPlan;
    campaignId: string;
  } | null;
};

export type AssistantChatResponse = {
  plan: AssistantPlan;
  status: "clarification" | "needs_approval" | "executed" | "denied" | "failed";
  results: AssistantToolResult[];
  pendingPack?: AssistantChatRequest["pendingPack"];
  pendingMetaPlan?: AssistantChatRequest["pendingMetaPlan"];
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

function statusFromScore(score: number): LeadStatus | undefined {
  if (score >= 70) return "qualified";
  if (score < 25) return "unqualified";
  return undefined;
}

export async function runAssistantChat(
  actor: SessionUser,
  orgId: string,
  input: AssistantChatRequest,
): Promise<AssistantChatResponse> {
  const role = await actorRole(actor, orgId);

  // Entitlement + AI metering gate (never silent bypass)
  try {
    const billing = getBillingStore();
    billing.requireFeature(orgId, "ai");
    // Clarification-only turns still plan; meter when executing tools below
  } catch (err) {
    const detail =
      err instanceof AuthError ? err.message : "AI not entitled on current plan";
    return {
      plan: planAssistantIntent({
        message: input.message,
        hasPendingPack: Boolean(input.pendingPack),
        hasPendingMetaPlan: Boolean(input.pendingMetaPlan),
      }),
      status: "denied",
      results: [],
      report: detail,
    };
  }

  const plan = planAssistantIntent({
    message: input.message,
    hasPendingPack: Boolean(input.pendingPack),
    hasPendingMetaPlan: Boolean(input.pendingMetaPlan),
  });

  if (plan.needsClarification) {
    return {
      plan,
      status: "clarification",
      results: [],
      pendingPack: input.pendingPack ?? null,
      pendingMetaPlan: input.pendingMetaPlan ?? null,
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
      pendingMetaPlan: input.pendingMetaPlan ?? null,
      report: `Plan ready (approval required): ${plan.summary}. Reply approve or click Approve to continue.`,
    };
  }

  try {
    getBillingStore().consumeAiCredits(orgId, 1);
  } catch (err) {
    const detail =
      err instanceof AuthError ? err.message : "AI usage quota exceeded";
    return {
      plan,
      status: "denied",
      results: [],
      report: detail,
    };
  }

  const results: AssistantToolResult[] = [];
  let pendingPack = input.pendingPack ?? null;
  let pendingMetaPlan = input.pendingMetaPlan ?? null;
  const crm = getDomainCrm();
  const campaigns = getDomainCampaigns();
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || undefined;

  for (const step of plan.steps) {
    try {
      if (step.tool === "list_leads") {
        const leads = await crm.listLeads(actor, orgId);
        const limit = Number(step.args.limit ?? 10);
        const slice = leads.slice(0, limit).map((l) => ({
          id: l.id,
          name: l.fullName,
          email: l.email,
          score: l.score,
          status: l.status,
          ownerUserId: l.ownerUserId,
        }));
        results.push({
          tool: step.tool,
          ok: true,
          detail: `Found ${leads.length} leads (showing ${slice.length})`,
          data: { leads: slice, total: leads.length },
        });
      } else if (step.tool === "get_results_summary") {
        const leads = await crm.listLeads(actor, orgId);
        const campaignList = await campaigns.listCampaigns(actor, orgId);
        const scored = leads.filter((l) => (l.score ?? 0) >= 45).length;
        const openTasks =
          "listTasks" in crm ? await crm.listTasks(actor, orgId) : [];
        results.push({
          tool: step.tool,
          ok: true,
          detail: `${leads.length} leads · ${scored} medium+ · ${campaignList.length} campaigns · ${openTasks.filter((t) => t.status === "open").length} open tasks`,
          data: {
            leadCount: leads.length,
            mediumPlus: scored,
            campaignCount: campaignList.length,
            openTasks: openTasks.filter((t) => t.status === "open").length,
          },
        });
      } else if (step.tool === "qualify_lead") {
        const text = String(step.args.text ?? input.message);
        const leadId = (step.args.leadId as string | null) ?? null;
        const q = qualifyLeadDeterministic({ text });
        let persisted: { id: string; score: number; status: string } | null = null;
        if (leadId && "updateLeadScore" in crm) {
          const updated = await crm.updateLeadScore(
            actor,
            orgId,
            leadId,
            q.score,
            statusFromScore(q.score),
          );
          persisted = { id: updated.id, score: updated.score, status: updated.status };
        }
        results.push({
          tool: step.tool,
          ok: true,
          detail: persisted
            ? `Lead ${persisted.id} → score ${persisted.score} (${q.intent}), status ${persisted.status}`
            : `Score ${q.score} (${q.intent}) · missing: ${q.missingFields.join(", ") || "none"}`,
          data: { qualification: q, lead: persisted },
        });
      } else if (step.tool === "assign_lead") {
        const leadId = String(step.args.leadId ?? "");
        const ownerUserId = String(step.args.ownerUserId ?? actor.id);
        const updated = await crm.assignLead(actor, orgId, leadId, ownerUserId);
        results.push({
          tool: step.tool,
          ok: true,
          detail: `Assigned ${updated.fullName} → ${updated.ownerUserId}`,
          data: { leadId: updated.id, ownerUserId: updated.ownerUserId },
        });
      } else if (step.tool === "create_follow_up_task") {
        const leadId = String(step.args.leadId ?? "");
        const dueInHours = Number(step.args.dueInHours ?? 24);
        const dueAt = new Date(Date.now() + dueInHours * 3600 * 1000).toISOString();
        const task = await crm.createTask(actor, orgId, {
          title: String(step.args.title ?? "Follow up with lead"),
          description: String(step.args.description ?? input.message),
          dueAt,
          entityType: "lead",
          entityId: leadId,
        });
        results.push({
          tool: step.tool,
          ok: true,
          detail: `Task “${task.title}” due ${task.dueAt}`,
          data: { task },
        });
      } else if (step.tool === "book_appointment") {
        const leadId = String(step.args.leadId ?? "");
        const startsAt = String(
          step.args.startsAt ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        );
        const kind = String(step.args.kind ?? "meeting");
        const durationMinutes = Number(step.args.durationMinutes ?? 30);
        if (getAuthMode() === "supabase") {
          const appt = await getSupabaseCrmStore().bookLeadAppointment(actor, orgId, {
            leadId,
            startsAt,
            kind,
            durationMinutes,
            siteVisitAddress:
              kind === "site_visit"
                ? String(step.args.siteVisitAddress ?? "TBD on site")
                : null,
            title: (step.args.title as string | null) ?? null,
          });
          results.push({
            tool: step.tool,
            ok: true,
            detail: `Booked ${appt.kind} “${appt.title}” at ${appt.startsAt}`,
            data: { appointment: appt },
          });
        } else {
          const cal = getCalendarStore();
          const types = await cal.listAppointmentTypes(actor, orgId);
          let typeId = types[0]?.id;
          if (!typeId) {
            const created = await cal.createAppointmentType(actor, orgId, {
              name: kind === "site_visit" ? "Site visit" : "Consultation",
              kind: kind === "site_visit" ? "site_visit" : "consultation",
              durationMinutes,
              requiresSiteVisit: kind === "site_visit",
            });
            typeId = created.id;
          }
          const appt = await cal.bookAppointment(actor, orgId, {
            appointmentTypeId: typeId,
            leadId,
            startsAt,
            title: (step.args.title as string | undefined) ?? undefined,
            siteVisitAddress:
              kind === "site_visit"
                ? String(step.args.siteVisitAddress ?? "TBD on site")
                : null,
            reminderMinutesBefore: 60,
          });
          results.push({
            tool: step.tool,
            ok: true,
            detail: `Booked ${appt.kind} “${appt.title}” at ${appt.startsAt}`,
            data: { appointment: appt },
          });
        }
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
      } else if (step.tool === "prepare_meta_ai_launch") {
        const draft = await prepareMetaAiLaunch(
          actor,
          orgId,
          {
            businessOrOffer: String(step.args.businessOrOffer ?? input.message),
            geo: String(step.args.geo ?? "your market"),
            budgetAmount: Number(step.args.budgetAmount ?? 25),
            budgetType: step.args.budgetType === "lifetime" ? "lifetime" : "daily",
            currency: String(step.args.currency ?? "USD"),
            objective: "lead_gen",
            audienceBasics: (step.args.audienceBasics as string | null) ?? null,
            creativeText: (step.args.creativeText as string | null) ?? null,
            landingPageUrl: (step.args.landingPageUrl as string | null) ?? null,
            enableSpend: false,
          },
          { publishLanding: true, appOrigin },
        );
        pendingMetaPlan = {
          plan: draft.plan,
          campaignId: draft.local.campaignId,
        };
        pendingPack = {
          formId: draft.local.formId,
          pageId: draft.local.pageId,
          pageSlug: draft.local.pageSlug,
          campaignId: draft.local.campaignId,
        };
        results.push({
          tool: step.tool,
          ok: true,
          detail: `Meta plan “${draft.plan.name}” ready (${draft.metaStatus.status}). Approve to create on Meta or save draft if credentials missing — never silent spend.`,
          data: {
            plan: draft.plan,
            local: draft.local,
            metaStatus: draft.metaStatus,
            pack: {
              publicPath: draft.local.publicPath,
              pageSlug: draft.local.pageSlug,
            },
          },
        });
      } else if (step.tool === "approve_meta_ai_launch") {
        if (!pendingMetaPlan) {
          results.push({
            tool: step.tool,
            ok: false,
            detail: "No pending Meta plan to approve",
          });
        } else {
          const result = await approveMetaAiLaunch(actor, orgId, {
            plan: pendingMetaPlan.plan,
            campaignId: pendingMetaPlan.campaignId,
            approved: true,
            enableSpend: Boolean(step.args.enableSpend),
          });
          results.push({
            tool: step.tool,
            ok: result.status !== "error",
            detail: result.detail,
            data: {
              status: result.status,
              external: result.external,
              setupHints: result.setupHints,
              localCampaignId: result.localCampaignId,
            },
          });
          if (result.status !== "error") {
            pendingMetaPlan = null;
          }
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
    pendingMetaPlan,
    report,
  };
}
