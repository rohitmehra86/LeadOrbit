"use client";

import { useState } from "react";
import type { AnalyticsDashboard, ScheduledReport } from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  from: string;
  to: string;
  dashboard: AnalyticsDashboard | null;
  reports: ScheduledReport[];
  error: string | null;
};

function availabilityTone(a: string) {
  if (a === "ok") return "text-emerald-400";
  if (a === "zero") return "text-[var(--lo-fg-muted)]";
  return "text-amber-400";
}

export function AnalyticsConsole(props: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [reports, setReports] = useState(props.reports);

  async function exportCsv(table?: string) {
    const q = new URLSearchParams({
      from: props.from,
      to: props.to,
    });
    if (table) q.set("table", table);
    window.open(`/api/v1/orgs/${props.orgId}/analytics/export?${q}`, "_blank");
  }

  async function schedule() {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/analytics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "schedule",
        name: "Weekly ops digest",
        cadence: "weekly",
        recipients: ["ops@example.com"],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? data.title ?? "Schedule failed");
      return;
    }
    setReports((r) => [data.report, ...r]);
    setMessage("Scheduled report scaffolded");
  }

  if (props.error) {
    return (
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        {props.error}
      </p>
    );
  }

  if (!props.dashboard) {
    return <p className="text-sm text-[var(--lo-fg-muted)]">No dashboard data.</p>;
  }

  const dash = props.dashboard;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--lo-fg-muted)]">
        <span>
          Range {dash.from.slice(0, 10)} → {dash.to.slice(0, 10)}
        </span>
        {dash.compareFrom ? (
          <span>
            vs {dash.compareFrom.slice(0, 10)} → {dash.compareTo?.slice(0, 10)}
          </span>
        ) : null}
        <Button type="button" onClick={() => exportCsv()}>
          Export CSV
        </Button>
        <Button type="button" onClick={() => exportCsv("funnel")}>
          Export funnel
        </Button>
        <Button type="button" onClick={() => void schedule()}>
          Schedule report
        </Button>
      </div>
      {message ? (
        <p className="text-sm text-[var(--lo-fg-muted)]">{message}</p>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-medium">Metrics</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dash.metrics.map((m) => (
            <li
              key={m.key}
              className="rounded-md border border-[var(--lo-border)] px-3 py-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{m.label}</span>
                <span className={availabilityTone(m.availability)}>
                  <Badge>{m.availability}</Badge>
                </span>
              </div>
              <p className="mt-2 font-mono text-xl">
                {m.availability === "unavailable" ? "—" : m.value}
                {m.unit ? (
                  <span className="ml-1 text-xs text-[var(--lo-fg-muted)]">
                    {m.unit}
                  </span>
                ) : null}
              </p>
              {m.detail ? (
                <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">{m.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {Object.entries(dash.tables).map(([key, rows]) => (
        <section key={key}>
          <h2 className="mb-3 text-lg font-medium">{key.replace(/_/g, " ")}</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--lo-fg-muted)]">Empty (zero rows).</p>
          ) : (
            <pre className="overflow-auto rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-3 text-xs">
              {JSON.stringify(rows, null, 2)}
            </pre>
          )}
        </section>
      ))}

      <section>
        <h2 className="mb-3 text-lg font-medium">Scheduled reports</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">
            None yet — scaffolding only until email delivery is configured.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                {r.name} · {r.cadence} · {r.status}
                <span className="mt-1 block text-xs text-[var(--lo-fg-muted)]">
                  {r.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
