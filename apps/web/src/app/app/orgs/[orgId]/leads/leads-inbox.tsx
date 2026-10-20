"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Lead } from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type MemberRow = { userId: string; role: string; self?: boolean };

function nextAction(lead: Lead): string {
  if (!lead.ownerUserId) return "Assign owner";
  if (lead.status === "new") return "First contact";
  if (lead.slaState === "breached" || lead.slaState === "escalated") {
    return "Resolve SLA";
  }
  if (lead.slaState === "warning") return "Touch before SLA";
  if (lead.status === "working") return "Continue follow-up";
  if (lead.status === "qualified") return "Advance opportunity";
  if (lead.status === "converted") return "Closed — archive if done";
  return "Review";
}

function ownerLabel(lead: Lead): string {
  if (!lead.ownerUserId) return "Unassigned";
  return lead.ownerUserId.slice(0, 8);
}

export function LeadsInbox({
  orgId,
  leads,
  members,
  currentUserId,
  initialStatus,
  initialOwner,
}: {
  orgId: string;
  leads: Lead[];
  members: MemberRow[];
  currentUserId: string;
  initialStatus?: string;
  initialOwner?: string;
}) {
  const [status, setStatus] = useState(initialStatus ?? "all");
  const [owner, setOwner] = useState(initialOwner ?? "all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return leads.filter((lead) => {
      if (status !== "all" && lead.status !== status) return false;
      if (owner === "unassigned" && lead.ownerUserId) return false;
      if (owner === "mine" && lead.ownerUserId !== currentUserId) return false;
      if (
        owner !== "all" &&
        owner !== "unassigned" &&
        owner !== "mine" &&
        lead.ownerUserId !== owner
      ) {
        return false;
      }
      const hay =
        `${lead.fullName} ${lead.email ?? ""} ${lead.phone ?? ""} ${lead.source}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      return true;
    });
  }, [leads, status, owner, q, currentUserId]);

  return (
    <div className="lo-panel">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Leads</h1>
          <p>
            Inbox with status, ownership, and next action. Scores come from
            capture and qualification.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/crm`}>
          <Button type="button" variant="secondary">
            Open full CRM
          </Button>
        </Link>
      </header>

      <div className="lo-filter-bar">
        <label className="lo-field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="working">Working</option>
            <option value="qualified">Qualified</option>
            <option value="unqualified">Unqualified</option>
            <option value="converted">Converted</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="lo-field">
          Owner
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            <option value="mine">Assigned to me</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId.slice(0, 8)} ({m.role})
              </option>
            ))}
          </select>
        </label>
        <label className="lo-field" style={{ minWidth: 200, flex: 1 }}>
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email, phone, source"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="lo-empty">
          <p className="lo-muted">
            {leads.length === 0
              ? "No leads yet. Launch a capture page from the AI Assistant, then share the public link."
              : "No leads match these filters."}
          </p>
          {leads.length === 0 ? (
            <Link href={`/app/orgs/${orgId}/assistant`}>
              <Button type="button">Open Assistant</Button>
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="lo-table-wrap">
          <table className="lo-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Status</th>
                <th>Score</th>
                <th>Owner</th>
                <th>Next action</th>
                <th>Source</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.fullName || "Unnamed"}</strong>
                    <div className="lo-muted text-xs">
                      {[lead.email, lead.phone].filter(Boolean).join(" · ") ||
                        "No contact"}
                    </div>
                  </td>
                  <td>
                    <Badge>{lead.status}</Badge>
                  </td>
                  <td>{lead.score ?? 0}</td>
                  <td className="lo-muted">{ownerLabel(lead)}</td>
                  <td>{nextAction(lead)}</td>
                  <td className="lo-muted">{lead.source}</td>
                  <td className="lo-muted whitespace-nowrap">
                    {new Date(lead.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="lo-muted mt-3 text-xs">
        Showing {Math.min(rows.length, 100)} of {rows.length} filtered ·{" "}
        {leads.length} total
      </p>
    </div>
  );
}
