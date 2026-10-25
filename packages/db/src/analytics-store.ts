import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  hasPermission,
  inDateRange,
  metricFromCount,
  metricRatio,
  toCsv,
  type AnalyticsDashboard,
  type MetricValue,
  type ScheduledReport,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import type { DurableJobQueue } from "./job-queue";

function nowIso(): string {
  return new Date().toISOString();
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(`select name from sqlite_master where type='table' and name=?`)
    .get(name) as { name: string } | undefined;
  return Boolean(row);
}

function countInRange(
  db: DatabaseSync,
  sql: string,
  params: unknown[],
): number {
  const row = db.prepare(sql).get(...params) as { c: number } | undefined;
  return Number(row?.c ?? 0);
}

function sumInRange(
  db: DatabaseSync,
  sql: string,
  params: unknown[],
): number {
  const row = db.prepare(sql).get(...params) as { s: number | null } | undefined;
  return Number(row?.s ?? 0);
}

/**
 * Analytics from real persisted tables + analytics_events.
 * Distinguishes unavailable (missing source) vs zero (source present, count 0).
 */
export class AnalyticsStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private queue: DurableJobQueue | null = null,
  ) {}

  setQueue(queue: DurableJobQueue): void {
    this.queue = queue;
  }

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "analytics:read" | "analytics:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  recordEvent(input: {
    orgId: string;
    eventType: string;
    channel?: string | null;
    campaignId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    actorUserId?: string | null;
    amount?: number | null;
    currency?: string | null;
    meta?: Record<string, unknown>;
    occurredAt?: string;
  }): void {
    const now = nowIso();
    this.db
      .prepare(
        `insert into analytics_events(
          id, org_id, event_type, channel, campaign_id, entity_type, entity_id,
          actor_user_id, amount, currency, meta, occurred_at, created_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        input.orgId,
        input.eventType,
        input.channel ?? null,
        input.campaignId ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
        input.actorUserId ?? null,
        input.amount ?? null,
        input.currency ?? null,
        JSON.stringify(input.meta ?? {}),
        input.occurredAt ?? now,
        now,
      );
  }

  async dashboard(
    actor: SessionUser,
    orgId: string,
    opts: {
      from: string;
      to: string;
      compareFrom?: string | null;
      compareTo?: string | null;
    },
  ): Promise<AnalyticsDashboard> {
    await this.gate(actor, orgId, "analytics:read");
    const from = opts.from;
    const to = opts.to;
    const metrics: MetricValue[] = [];
    const tables: AnalyticsDashboard["tables"] = {};
    const series: AnalyticsDashboard["series"] = {};

    const hasLeads = tableExists(this.db, "leads");
    const hasCampaigns = tableExists(this.db, "campaigns");
    const hasAttr = tableExists(this.db, "attribution_touchpoints");
    const hasOpps = tableExists(this.db, "opportunities");
    const hasAppts = tableExists(this.db, "appointments");
    const hasAi = tableExists(this.db, "ai_usage_events");
    const hasVoice = tableExists(this.db, "voice_calls");
    const hasMsgs = tableExists(this.db, "inbox_messages");
    const hasJobs = tableExists(this.db, "durable_jobs");
    const hasSubs = tableExists(this.db, "org_subscriptions");
    const hasEvents = tableExists(this.db, "analytics_events");

    // Leads by channel
    if (hasLeads) {
      const totalLeads = countInRange(
        this.db,
        `select count(*) as c from leads where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      metrics.push(metricFromCount("leads_total", "Leads", totalLeads, { sourceAvailable: true }));

      const bySource = this.db
        .prepare(
          `select source as channel, count(*) as c from leads
           where org_id=? and created_at>=? and created_at<=?
           group by source order by c desc`,
        )
        .all(orgId, from, to) as Array<{ channel: string; c: number }>;
      tables.leads_by_channel = bySource.map((r) => ({
        channel: r.channel,
        leads: r.c,
      }));
      metrics.push(
        metricFromCount(
          "leads_channels",
          "Lead channels",
          bySource.length,
          { sourceAvailable: true },
        ),
      );
    } else {
      metrics.push(
        metricFromCount("leads_total", "Leads", 0, {
          sourceAvailable: false,
          detail: "leads table unavailable",
        }),
      );
    }

    // Campaign leads + CPL / CPQL
    if (hasCampaigns && hasLeads) {
      const campaignRows = this.db
        .prepare(
          `select c.id, c.name,
             json_extract(c.budget, '$.amount') as budget_amount,
             (select count(*) from leads l where l.org_id=c.org_id
               and l.created_at>=? and l.created_at<=?
               and (l.custom_fields like '%' || c.id || '%' or exists (
                 select 1 from attribution_touchpoints a
                 where a.org_id=c.org_id and a.campaign_id=c.id and a.lead_id=l.id
               ))) as lead_count
           from campaigns c where c.org_id=?`,
        )
        .all(from, to, orgId) as Array<{
        id: string;
        name: string;
        budget_amount: number | null;
        lead_count: number;
      }>;

      tables.leads_by_campaign = campaignRows.map((r) => ({
        campaignId: r.id,
        campaign: r.name,
        leads: r.lead_count,
        budget: r.budget_amount,
      }));

      let spend = 0;
      let leadsFromCampaigns = 0;
      for (const r of campaignRows) {
        spend += Number(r.budget_amount ?? 0);
        leadsFromCampaigns += r.lead_count;
      }
      metrics.push(
        metricRatio("cpl", "CPL", spend || null, leadsFromCampaigns || null, {
          sourceAvailable: true,
        }),
      );
      // CPQL: cost per qualified lead (score >= 50)
      const qualified = countInRange(
        this.db,
        `select count(*) as c from leads where org_id=? and score>=50 and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      metrics.push(
        metricRatio("cpql", "CPQL", spend || null, qualified || null, {
          sourceAvailable: true,
        }),
      );
      metrics.push(
        metricFromCount("campaign_leads", "Campaign-attributed leads", leadsFromCampaigns, {
          sourceAvailable: true,
        }),
      );
    } else {
      metrics.push(
        metricRatio("cpl", "CPL", null, null, { sourceAvailable: false }),
      );
      metrics.push(
        metricRatio("cpql", "CPQL", null, null, { sourceAvailable: false }),
      );
    }

    // Funnel: lead → opportunity → won
    if (hasLeads && hasOpps) {
      const leads = countInRange(
        this.db,
        `select count(*) as c from leads where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      const opps = countInRange(
        this.db,
        `select count(*) as c from opportunities where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      const won = countInRange(
        this.db,
        `select count(*) as c from opportunities where org_id=? and status='won' and updated_at>=? and updated_at<=?`,
        [orgId, from, to],
      );
      tables.funnel = [
        { stage: "leads", count: leads },
        { stage: "opportunities", count: opps },
        { stage: "won", count: won },
      ];
      metrics.push(metricFromCount("funnel_leads", "Funnel leads", leads));
      metrics.push(metricFromCount("funnel_opps", "Funnel opportunities", opps));
      metrics.push(metricFromCount("funnel_won", "Funnel won", won));
      metrics.push(
        metricRatio("funnel_conversion", "Lead→won rate", won, leads || null),
      );
    } else {
      metrics.push(
        metricFromCount("funnel_leads", "Funnel leads", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Pipeline value
    if (hasOpps) {
      const openValue = sumInRange(
        this.db,
        `select coalesce(sum(amount),0) as s from opportunities
         where org_id=? and status='open'`,
        [orgId],
      );
      const wonRevenue = sumInRange(
        this.db,
        `select coalesce(sum(amount),0) as s from opportunities
         where org_id=? and status='won' and updated_at>=? and updated_at<=?`,
        [orgId, from, to],
      );
      metrics.push(
        metricFromCount("pipeline_value", "Open pipeline value", openValue, {
          unit: "currency",
        }),
      );
      metrics.push(
        metricFromCount("revenue_won", "Won revenue", wonRevenue, {
          unit: "currency",
        }),
      );
    } else {
      metrics.push(
        metricFromCount("pipeline_value", "Open pipeline value", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Revenue attribution
    if (hasAttr && hasOpps) {
      const attr = this.db
        .prepare(
          `select a.channel, coalesce(sum(o.amount),0) as revenue, count(distinct o.id) as deals
           from attribution_touchpoints a
           left join opportunities o on o.id=a.opportunity_id and o.org_id=a.org_id
           where a.org_id=? and a.occurred_at>=? and a.occurred_at<=?
           group by a.channel`,
        )
        .all(orgId, from, to) as Array<{
        channel: string;
        revenue: number;
        deals: number;
      }>;
      tables.revenue_attribution = attr.map((r) => ({
        channel: r.channel,
        revenue: r.revenue,
        deals: r.deals,
      }));
      const attrRevenue = attr.reduce((s, r) => s + r.revenue, 0);
      metrics.push(
        metricFromCount("attributed_revenue", "Attributed revenue", attrRevenue, {
          unit: "currency",
        }),
      );
    } else {
      metrics.push(
        metricFromCount("attributed_revenue", "Attributed revenue", 0, {
          sourceAvailable: false,
          detail: "attribution_touchpoints unavailable",
        }),
      );
    }

    // ROI = (revenue - spend) / spend
    {
      const rev = metrics.find((m) => m.key === "revenue_won");
      const cpl = metrics.find((m) => m.key === "cpl");
      const spendMetric = tables.leads_by_campaign
        ? (tables.leads_by_campaign as Array<{ budget: number | null }>).reduce(
            (s, r) => s + Number(r.budget ?? 0),
            0,
          )
        : null;
      if (rev?.availability === "unavailable" || spendMetric == null) {
        metrics.push(
          metricRatio("roi", "ROI", null, null, { sourceAvailable: false }),
        );
      } else {
        const revenue = rev?.value ?? 0;
        if (spendMetric === 0) {
          metrics.push(
            metricRatio("roi", "ROI", null, null, { sourceAvailable: true }),
          );
          // Fix: use zero denominator path
          metrics[metrics.length - 1] = metricRatio("roi", "ROI", revenue, 0, {
            sourceAvailable: true,
          });
        } else {
          metrics.push(
            metricRatio("roi", "ROI", revenue - spendMetric, spendMetric, {
              sourceAvailable: true,
            }),
          );
        }
      }
      void cpl;
    }

    // Response time (first activity after lead create)
    if (hasLeads && tableExists(this.db, "activities")) {
      const rows = this.db
        .prepare(
          `select l.created_at as lead_at,
             (select min(a.created_at) from activities a
              where a.org_id=l.org_id and a.entity_type='lead' and a.entity_id=l.id) as first_act
           from leads l
           where l.org_id=? and l.created_at>=? and l.created_at<=?`,
        )
        .all(orgId, from, to) as Array<{
        lead_at: string;
        first_act: string | null;
      }>;
      const deltas = rows
        .filter((r) => r.first_act)
        .map(
          (r) =>
            new Date(r.first_act!).getTime() - new Date(r.lead_at).getTime(),
        )
        .filter((d) => d >= 0);
      if (deltas.length === 0) {
        metrics.push(
          metricFromCount("avg_response_ms", "Avg response time (ms)", 0, {
            sourceAvailable: true,
            detail: "No response activities in range",
          }),
        );
      } else {
        const avg = Math.round(
          deltas.reduce((a, b) => a + b, 0) / deltas.length,
        );
        metrics.push(
          metricFromCount("avg_response_ms", "Avg response time (ms)", avg, {
            unit: "ms",
          }),
        );
      }
    } else {
      metrics.push(
        metricFromCount("avg_response_ms", "Avg response time (ms)", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Agent productivity
    if (hasLeads) {
      const agents = this.db
        .prepare(
          `select coalesce(owner_user_id, 'unassigned') as agent, count(*) as c
           from leads where org_id=? and created_at>=? and created_at<=?
           group by owner_user_id`,
        )
        .all(orgId, from, to) as Array<{ agent: string; c: number }>;
      tables.agent_productivity = agents.map((a) => ({
        agent: a.agent,
        leads: a.c,
      }));
      metrics.push(
        metricFromCount("active_agents", "Agents with leads", agents.length),
      );
    }

    // Appointment conversion
    if (hasAppts && hasLeads) {
      const booked = countInRange(
        this.db,
        `select count(*) as c from appointments where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      const completed = countInRange(
        this.db,
        `select count(*) as c from appointments where org_id=? and status='completed' and updated_at>=? and updated_at<=?`,
        [orgId, from, to],
      );
      const leadCount = countInRange(
        this.db,
        `select count(*) as c from leads where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      metrics.push(metricFromCount("appointments_booked", "Appointments booked", booked));
      metrics.push(
        metricRatio(
          "appointment_conversion",
          "Appointment conversion",
          booked,
          leadCount || null,
        ),
      );
      metrics.push(
        metricRatio(
          "appointment_completion",
          "Appointment completion",
          completed,
          booked || null,
        ),
      );
    } else {
      metrics.push(
        metricFromCount("appointments_booked", "Appointments booked", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Lost reasons
    if (hasOpps) {
      const lost = this.db
        .prepare(
          `select coalesce(json_extract(custom_fields, '$.lostReason'), status) as reason, count(*) as c
           from opportunities
           where org_id=? and status='lost' and updated_at>=? and updated_at<=?
           group by reason`,
        )
        .all(orgId, from, to) as Array<{ reason: string; c: number }>;
      tables.lost_reasons = lost.map((r) => ({
        reason: r.reason,
        count: r.c,
      }));
      metrics.push(
        metricFromCount(
          "lost_deals",
          "Lost deals",
          lost.reduce((s, r) => s + r.c, 0),
        ),
      );
    } else {
      metrics.push(
        metricFromCount("lost_deals", "Lost deals", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // AI performance
    if (hasAi) {
      const turns = countInRange(
        this.db,
        `select count(*) as c from ai_usage_events where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      const cost = sumInRange(
        this.db,
        `select coalesce(sum(estimated_cost_usd),0) as s from ai_usage_events
         where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      const avgLatency = sumInRange(
        this.db,
        `select coalesce(avg(latency_ms),0) as s from ai_usage_events
         where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      metrics.push(metricFromCount("ai_turns", "AI usage events", turns));
      metrics.push(
        metricFromCount("ai_cost_usd", "AI cost (USD)", Number(cost.toFixed(4)), {
          unit: "usd",
        }),
      );
      metrics.push(
        metricFromCount("ai_avg_latency_ms", "AI avg latency (ms)", Math.round(avgLatency), {
          unit: "ms",
        }),
      );
    } else {
      metrics.push(
        metricFromCount("ai_turns", "AI usage events", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Communication costs (voice + message scaffolding)
    let commCost = 0;
    let commAvailable = false;
    if (hasVoice) {
      commAvailable = true;
      commCost += sumInRange(
        this.db,
        `select coalesce(sum(cost_usd),0) as s from voice_calls
         where org_id=? and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
    }
    if (hasMsgs) {
      commAvailable = true;
      // No cost column — count as zero-cost unless meta present
    }
    if (hasEvents) {
      const eventCost = sumInRange(
        this.db,
        `select coalesce(sum(amount),0) as s from analytics_events
         where org_id=? and event_type='communication_cost' and occurred_at>=? and occurred_at<=?`,
        [orgId, from, to],
      );
      if (eventCost > 0) {
        commAvailable = true;
        commCost += eventCost;
      }
    }
    metrics.push(
      metricFromCount("communication_cost", "Communication cost", commCost, {
        sourceAvailable: commAvailable || hasVoice,
        unit: "usd",
      }),
    );

    // SaaS subscription revenue (platform view from invoices paid)
    if (tableExists(this.db, "billing_invoices")) {
      const saas = sumInRange(
        this.db,
        `select coalesce(sum(amount_cents),0)/100.0 as s from billing_invoices
         where org_id=? and status='paid' and created_at>=? and created_at<=?`,
        [orgId, from, to],
      );
      metrics.push(
        metricFromCount("saas_revenue", "SaaS subscription revenue", saas, {
          unit: "usd",
        }),
      );
    } else {
      metrics.push(
        metricFromCount("saas_revenue", "SaaS subscription revenue", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Tenant usage
    if (hasSubs) {
      const sub = this.db
        .prepare(`select * from org_subscriptions where org_id=?`)
        .get(orgId) as
        | {
            seats_used: number;
            seats_included: number;
            ai_credits_used: number;
            ai_credits_included: number;
          }
        | undefined;
      if (sub) {
        metrics.push(
          metricFromCount("seats_used", "Seats used", sub.seats_used),
        );
        metrics.push(
          metricFromCount("ai_credits_used", "AI credits used", sub.ai_credits_used),
        );
        tables.tenant_usage = [
          {
            seatsUsed: sub.seats_used,
            seatsIncluded: sub.seats_included,
            aiCreditsUsed: sub.ai_credits_used,
            aiCreditsIncluded: sub.ai_credits_included,
          },
        ];
      } else {
        metrics.push(
          metricFromCount("seats_used", "Seats used", 0, {
            sourceAvailable: true,
            detail: "No subscription row",
          }),
        );
      }
    } else {
      metrics.push(
        metricFromCount("seats_used", "Seats used", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Operational failures
    if (hasJobs) {
      const failed = countInRange(
        this.db,
        `select count(*) as c from durable_jobs
         where json_extract(payload, '$.orgId')=? and status in ('failed','dead_letter')
           and updated_at>=? and updated_at<=?`,
        [orgId, from, to],
      );
      metrics.push(
        metricFromCount("operational_failures", "Operational failures", failed),
      );
    } else {
      metrics.push(
        metricFromCount("operational_failures", "Operational failures", 0, {
          sourceAvailable: false,
        }),
      );
    }

    // Comparison period deltas (scaffolding)
    if (opts.compareFrom && opts.compareTo && hasLeads) {
      const prev = countInRange(
        this.db,
        `select count(*) as c from leads where org_id=? and created_at>=? and created_at<=?`,
        [orgId, opts.compareFrom, opts.compareTo],
      );
      const curr =
        metrics.find((m) => m.key === "leads_total")?.value ?? 0;
      tables.comparisons = [
        {
          metric: "leads_total",
          current: curr,
          previous: prev,
          delta: Number(curr) - prev,
        },
      ];
    }

    // Daily lead series
    if (hasLeads) {
      const daily = this.db
        .prepare(
          `select substr(created_at,1,10) as d, count(*) as c from leads
           where org_id=? and created_at>=? and created_at<=?
           group by d order by d`,
        )
        .all(orgId, from, to) as Array<{ d: string; c: number }>;
      series.leads_daily = daily.map((r) => ({
        date: r.d,
        value: r.c,
        availability: r.c === 0 ? ("zero" as const) : ("ok" as const),
      }));
    }

    return {
      orgId,
      from,
      to,
      compareFrom: opts.compareFrom ?? null,
      compareTo: opts.compareTo ?? null,
      generatedAt: nowIso(),
      metrics,
      series,
      tables,
    };
  }

  async exportCsv(
    actor: SessionUser,
    orgId: string,
    opts: { from: string; to: string; table?: string },
  ): Promise<{ filename: string; csv: string }> {
    const dash = await this.dashboard(actor, orgId, {
      from: opts.from,
      to: opts.to,
    });
    const key = opts.table ?? "leads_by_channel";
    const rows = dash.tables[key] ?? dash.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      value: m.value,
      availability: m.availability,
    }));
    return {
      filename: `leadorbit-${key}-${opts.from.slice(0, 10)}.csv`,
      csv: toCsv(rows as Array<Record<string, string | number | null>>),
    };
  }

  async scheduleReport(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      cadence: "daily" | "weekly" | "monthly";
      recipients: string[];
    },
  ): Promise<ScheduledReport> {
    await this.gate(actor, orgId, "analytics:write");
    const id = randomUUID();
    const now = nowIso();
    const report: ScheduledReport = {
      id,
      orgId,
      name: input.name,
      cadence: input.cadence,
      recipients: input.recipients,
      status: "scaffolded",
      detail:
        "Scheduled report scaffolded — delivery requires email provider configuration",
      createdAt: now,
    };
    this.db
      .prepare(
        `insert into scheduled_reports(id, org_id, name, cadence, recipients, status, detail, created_at)
         values (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        report.name,
        report.cadence,
        JSON.stringify(report.recipients),
        report.status,
        report.detail,
        now,
      );
    if (this.queue) {
      await this.queue.enqueue(
        "report.schedule",
        { orgId, reportId: id },
        { idempotencyKey: `report:${id}` },
      );
    }
    return report;
  }

  async listScheduledReports(
    actor: SessionUser,
    orgId: string,
  ): Promise<ScheduledReport[]> {
    await this.gate(actor, orgId, "analytics:read");
    const rows = this.db
      .prepare(
        `select * from scheduled_reports where org_id=? order by created_at desc`,
      )
      .all(orgId) as Array<{
      id: string;
      org_id: string;
      name: string;
      cadence: string;
      recipients: string;
      status: string;
      detail: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      name: r.name,
      cadence: r.cadence as ScheduledReport["cadence"],
      recipients: JSON.parse(r.recipients) as string[],
      status: r.status as ScheduledReport["status"],
      detail: r.detail,
      createdAt: r.created_at,
    }));
  }
}

export { inDateRange };
