"use client";

import { useState } from "react";
import { Badge, Button } from "@leadorbit/ui";

type Org = {
  id: string;
  name: string;
  slug: string;
  orgType: string;
  createdAt: string;
};

type UsageRow = {
  orgId: string;
  planCode: string;
  status: string;
  aiCreditsUsed: number;
  aiCreditsIncluded: number;
  usageQuotas: Record<string, { limit: number; used: number }>;
};

type Flag = {
  id: string;
  orgId: string | null;
  key: string;
  enabled: boolean;
};

type Audit = {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  createdAt: string;
};

type Tab = "tenants" | "usage" | "flags" | "audit";

export function PlatformOpsConsole(props: {
  orgs: Org[];
  usage: UsageRow[];
  flags: Flag[];
  audit: Audit[];
}) {
  const [tab, setTab] = useState<Tab>("tenants");
  const [flags, setFlags] = useState(props.flags);
  const [message, setMessage] = useState<string | null>(null);
  const [flagKey, setFlagKey] = useState("inbox_v1");
  const [flagOrgId, setFlagOrgId] = useState("");

  async function setFlag(enabled: boolean) {
    setMessage(null);
    const res = await fetch("/api/v1/platform/flags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: flagKey,
        enabled,
        orgId: flagOrgId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Flag update failed");
      return;
    }
    setFlags((prev) => {
      const rest = prev.filter((f) => f.id !== data.flag.id);
      return [data.flag, ...rest];
    });
    setMessage(`Flag ${data.flag.key} → ${data.flag.enabled ? "on" : "off"}`);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "tenants", label: "Tenants" },
    { id: "usage", label: "Usage" },
    { id: "flags", label: "Flags" },
    { id: "audit", label: "Audit" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2 border-b border-[var(--lo-border)] pb-2 text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "font-medium text-[var(--lo-accent)]"
                : "text-[var(--lo-fg-muted)]"
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {message ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      {tab === "tenants" ? (
        <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
          {props.orgs.map((o) => (
            <li key={o.id} className="flex justify-between px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{o.name}</span>{" "}
                <span className="text-[var(--lo-fg-muted)]">{o.slug}</span>
              </span>
              <span className="text-[var(--lo-fg-muted)]">
                {o.orgType} · {o.createdAt}
              </span>
            </li>
          ))}
          {props.orgs.length === 0 ? (
            <li className="px-4 py-6 text-sm text-[var(--lo-fg-muted)]">
              No tenants yet.
            </li>
          ) : null}
        </ul>
      ) : null}

      {tab === "usage" ? (
        <ul className="space-y-2">
          {props.usage.map((u) => (
            <li
              key={u.orgId}
              className="rounded-md border border-[var(--lo-border)] px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs">{u.orgId}</span>
                <Badge>
                  {u.planCode} · {u.status}
                </Badge>
              </div>
              <p className="mt-2 text-[var(--lo-fg-muted)]">
                AI credits {u.aiCreditsUsed}/{u.aiCreditsIncluded < 0 ? "∞" : u.aiCreditsIncluded}
              </p>
              <ul className="mt-1 flex flex-wrap gap-2 text-xs">
                {Object.entries(u.usageQuotas).map(([k, v]) => (
                  <li key={k}>
                    <Badge>
                      {k}: {v.used}/{v.limit < 0 ? "∞" : v.limit}
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {props.usage.length === 0 ? (
            <p className="text-sm text-[var(--lo-fg-muted)]">No usage rows yet.</p>
          ) : null}
        </ul>
      ) : null}

      {tab === "flags" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2 text-sm"
              value={flagKey}
              onChange={(e) => setFlagKey(e.target.value)}
              placeholder="flag key"
            />
            <input
              className="min-w-[200px] flex-1 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2 font-mono text-sm"
              value={flagOrgId}
              onChange={(e) => setFlagOrgId(e.target.value)}
              placeholder="org UUID (empty = global)"
            />
            <Button type="button" onClick={() => void setFlag(true)}>
              Enable
            </Button>
            <Button type="button" variant="secondary" onClick={() => void setFlag(false)}>
              Disable
            </Button>
          </div>
          <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
            {flags.map((f) => (
              <li key={f.id} className="flex justify-between px-4 py-3 text-sm">
                <span>
                  <span className="font-mono">{f.key}</span>{" "}
                  <span className="text-[var(--lo-fg-muted)]">
                    {f.orgId ?? "global"}
                  </span>
                </span>
                <Badge>{f.enabled ? "on" : "off"}</Badge>
              </li>
            ))}
            {flags.length === 0 ? (
              <li className="px-4 py-6 text-sm text-[var(--lo-fg-muted)]">
                No flags recorded.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === "audit" ? (
        <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
          {props.audit.map((a) => (
            <li key={a.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{a.action}</span>
                <span className="text-xs text-[var(--lo-fg-muted)]">{a.createdAt}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">
                {a.entityType}
                {a.orgId ? ` · org ${a.orgId}` : ""}
                {a.actorUserId ? ` · actor ${a.actorUserId}` : ""}
              </p>
            </li>
          ))}
          {props.audit.length === 0 ? (
            <li className="px-4 py-6 text-sm text-[var(--lo-fg-muted)]">
              No audit entries yet.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
