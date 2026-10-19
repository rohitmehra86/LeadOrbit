"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type {
  AssignmentRule,
  Contact,
  Company,
  CrmTask,
  FollowUpReminder,
  Lead,
  Opportunity,
  PipelineStage,
} from "@leadorbit/domain";
import { Button, Badge } from "@leadorbit/ui";

type Props = {
  orgId: string;
  leadStages: PipelineStage[];
  dealStages: PipelineStage[];
  leads: Lead[];
  opportunities: Opportunity[];
  contacts: Contact[];
  companies: Company[];
  tasks: CrmTask[];
  reminders: FollowUpReminder[];
  rules: AssignmentRule[];
};

export function CrmBoard(props: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"leads" | "deals" | "contacts" | "tasks">("leads");
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<string | null>(
    props.leads[0]?.id ?? null,
  );
  const [timeline, setTimeline] = useState<
    Array<{ activityType: string; summary: string; createdAt: string }>
  >([]);

  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of props.leadStages) map.set(s.id, []);
    for (const l of props.leads) {
      const key = l.stageId ?? props.leadStages[0]?.id ?? "none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return map;
  }, [props.leads, props.leadStages]);

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const s of props.dealStages) map.set(s.id, []);
    for (const o of props.opportunities) {
      if (!map.has(o.stageId)) map.set(o.stageId, []);
      map.get(o.stageId)!.push(o);
    }
    return map;
  }, [props.opportunities, props.dealStages]);

  async function refresh() {
    router.refresh();
  }

  async function createLead(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: fd.get("fullName"),
        email: fd.get("email"),
        phone: fd.get("phone"),
        source: fd.get("source") || "manual",
        territory: fd.get("territory") || null,
        assignStrategy: fd.get("assignStrategy") || "manual",
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(body?.detail ?? "Create failed");
      return;
    }
    e.currentTarget.reset();
    await refresh();
  }

  async function moveLead(leadId: string, stageId: string) {
    await fetch(`/api/v1/orgs/${props.orgId}/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    await refresh();
  }

  async function moveDeal(oppId: string, stageId: string) {
    await fetch(`/api/v1/orgs/${props.orgId}/opportunities/${oppId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    await refresh();
  }

  async function loadTimeline(leadId: string) {
    setSelectedLead(leadId);
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/activities?entityType=lead&entityId=${leadId}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { items: typeof timeline };
      setTimeline(data.items);
    }
  }

  async function escalate() {
    await fetch(`/api/v1/orgs/${props.orgId}/sla/escalate`, { method: "POST" });
    await refresh();
  }

  async function saveRrRule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const userIds = String(fd.get("userIds") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await fetch(`/api/v1/orgs/${props.orgId}/assignment-rules`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Default RR",
        strategy: "round_robin",
        enabled: true,
        config: { userIds, roundRobinCursor: 0 },
      }),
    });
    await refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {(["leads", "deals", "contacts", "tasks"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${
              tab === t
                ? "bg-[var(--lo-accent)] text-[var(--lo-accent-fg)]"
                : "border border-[var(--lo-border)]"
            }`}
          >
            {t}
          </button>
        ))}
        {(tab === "leads" || tab === "deals") && (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm ${view === "kanban" ? "bg-[var(--lo-surface-elevated)]" : ""}`}
              onClick={() => setView("kanban")}
            >
              Kanban
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm ${view === "table" ? "bg-[var(--lo-surface-elevated)]" : ""}`}
              onClick={() => setView("table")}
            >
              Table
            </button>
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {tab === "leads" ? (
        <>
          <form
            onSubmit={createLead}
            className="grid gap-2 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4 md:grid-cols-6"
          >
            <input
              name="fullName"
              required
              placeholder="Full name"
              className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-2 py-1.5 text-sm"
            />
            <input
              name="email"
              placeholder="Email"
              className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-2 py-1.5 text-sm"
            />
            <input
              name="phone"
              placeholder="Phone"
              className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-2 py-1.5 text-sm"
            />
            <input
              name="territory"
              placeholder="Territory"
              className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-2 py-1.5 text-sm"
            />
            <select
              name="assignStrategy"
              className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-2 py-1.5 text-sm"
              defaultValue="manual"
            >
              <option value="manual">Manual</option>
              <option value="round_robin">Round robin</option>
              <option value="workload_based">Workload</option>
              <option value="territory_based">Territory</option>
              <option value="availability_based">Availability</option>
              <option value="rules_based">Rules</option>
            </select>
            <Button type="submit">Add lead</Button>
          </form>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Button type="button" variant="secondary" onClick={() => void escalate()}>
              Run SLA escalation
            </Button>
            <a
              className="underline text-[var(--lo-fg-muted)]"
              href={`/api/v1/orgs/${props.orgId}/leads/export`}
            >
              Export CSV
            </a>
            <Badge>{props.leads.length} leads</Badge>
          </div>

          {view === "kanban" ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {props.leadStages.map((stage) => (
                <div
                  key={stage.id}
                  className="min-w-[220px] flex-1 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)]/60"
                >
                  <div className="border-b border-[var(--lo-border)] px-3 py-2 text-sm font-medium">
                    {stage.name}{" "}
                    <span className="text-[var(--lo-fg-muted)]">
                      ({leadsByStage.get(stage.id)?.length ?? 0})
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2 p-2">
                    {(leadsByStage.get(stage.id) ?? []).map((lead) => (
                      <li
                        key={lead.id}
                        className="cursor-pointer rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] p-2 text-sm"
                        onClick={() => void loadTimeline(lead.id)}
                      >
                        <div className="font-medium">{lead.fullName}</div>
                        <div className="text-xs text-[var(--lo-fg-muted)]">
                          {lead.email ?? "—"} · SLA {lead.slaState}
                        </div>
                        <select
                          className="mt-2 w-full rounded border border-[var(--lo-border)] bg-transparent text-xs"
                          value={lead.stageId ?? stage.id}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => void moveLead(lead.id, e.target.value)}
                        >
                          {props.leadStages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[var(--lo-border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--lo-surface)] text-[var(--lo-fg-muted)]">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {props.leads.map((l) => (
                    <tr
                      key={l.id}
                      className="border-t border-[var(--lo-border)] hover:bg-[var(--lo-surface)]"
                      onClick={() => void loadTimeline(l.id)}
                    >
                      <td className="px-3 py-2">{l.fullName}</td>
                      <td className="px-3 py-2">{l.email}</td>
                      <td className="px-3 py-2">{l.status}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {l.ownerUserId?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="px-3 py-2">{l.slaState}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-[var(--lo-border)] p-4">
              <h2 className="mb-2 font-medium">Activity timeline</h2>
              {!selectedLead ? (
                <p className="text-sm text-[var(--lo-fg-muted)]">Select a lead.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {timeline.map((a, i) => (
                    <li key={`${a.createdAt}-${i}`}>
                      <span className="font-medium">{a.activityType}</span> — {a.summary}
                      <div className="text-xs text-[var(--lo-fg-muted)]">{a.createdAt}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-md border border-[var(--lo-border)] p-4">
              <h2 className="mb-2 font-medium">Round-robin pool</h2>
              <form onSubmit={saveRrRule} className="flex flex-col gap-2 text-sm">
                <input
                  name="userIds"
                  placeholder="userId1,userId2"
                  className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-2 py-1.5"
                />
                <Button type="submit" variant="secondary">
                  Save assignment rule
                </Button>
              </form>
              <ul className="mt-3 text-xs text-[var(--lo-fg-muted)]">
                {props.rules.map((r) => (
                  <li key={r.id}>
                    {r.name} · {r.strategy} · {r.enabled ? "on" : "off"}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      ) : null}

      {tab === "deals" ? (
        view === "kanban" ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {props.dealStages.map((stage) => (
              <div
                key={stage.id}
                className="min-w-[220px] flex-1 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)]/60"
              >
                <div className="border-b border-[var(--lo-border)] px-3 py-2 text-sm font-medium">
                  {stage.name}
                </div>
                <ul className="flex flex-col gap-2 p-2">
                  {(dealsByStage.get(stage.id) ?? []).map((opp) => (
                    <li
                      key={opp.id}
                      className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] p-2 text-sm"
                    >
                      <div className="font-medium">{opp.name}</div>
                      <div className="text-xs text-[var(--lo-fg-muted)]">
                        {opp.amount} {opp.currency}
                      </div>
                      <select
                        className="mt-2 w-full rounded border border-[var(--lo-border)] bg-transparent text-xs"
                        value={opp.stageId}
                        onChange={(e) => void moveDeal(opp.id, e.target.value)}
                      >
                        {props.dealStages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[var(--lo-fg-muted)]">
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Amount</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {props.opportunities.map((o) => (
                <tr key={o.id} className="border-t border-[var(--lo-border)]">
                  <td className="px-2 py-1">{o.name}</td>
                  <td className="px-2 py-1">
                    {o.amount} {o.currency}
                  </td>
                  <td className="px-2 py-1">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {tab === "contacts" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="mb-2 font-medium">Contacts</h2>
            <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)] text-sm">
              {props.contacts.map((c) => (
                <li key={c.id} className="px-3 py-2">
                  {c.fullName} · {c.email}
                </li>
              ))}
              {props.contacts.length === 0 ? (
                <li className="px-3 py-4 text-[var(--lo-fg-muted)]">No contacts yet.</li>
              ) : null}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Companies</h2>
            <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)] text-sm">
              {props.companies.map((c) => (
                <li key={c.id} className="px-3 py-2">
                  {c.name} · {c.domain}
                </li>
              ))}
              {props.companies.length === 0 ? (
                <li className="px-3 py-4 text-[var(--lo-fg-muted)]">No companies yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="mb-2 font-medium">Tasks</h2>
            <ul className="space-y-2 text-sm">
              {props.tasks.map((t) => (
                <li key={t.id} className="rounded border border-[var(--lo-border)] px-3 py-2">
                  {t.title} · {t.status} · due {t.dueAt ?? "—"}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Follow-up reminders</h2>
            <ul className="space-y-2 text-sm">
              {props.reminders.map((r) => (
                <li key={r.id} className="rounded border border-[var(--lo-border)] px-3 py-2">
                  {r.entityType}/{r.entityId.slice(0, 8)} · {r.dueAt} · {r.status}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
