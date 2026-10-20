"use client";

import { useState } from "react";
import type {
  InboundPartnerEvent,
  OutboundWebhookDelivery,
  OutboundWebhookSubscription,
  PartnerEventType,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type CatalogItem = {
  type: PartnerEventType;
  description: string;
  zapierHint: string;
};

export function PartnerWebhooksConsole(props: {
  orgId: string;
  catalog: CatalogItem[];
  subscriptions: OutboundWebhookSubscription[];
  deliveries: OutboundWebhookDelivery[];
  inbound: InboundPartnerEvent[];
  inboundPath: string;
}) {
  const [subs, setSubs] = useState(props.subscriptions);
  const [deliveries, setDeliveries] = useState(props.deliveries);
  const [inbound, setInbound] = useState(props.inbound);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("Zapier Catch Hook");
  const [targetUrl, setTargetUrl] = useState("http://127.0.0.1:9999/hooks/catch");
  const [inboundSecret, setInboundSecret] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/v1/orgs/${props.orgId}/partner-webhooks`);
    const data = await res.json();
    if (res.ok) {
      setSubs(data.subscriptions);
      setDeliveries(data.deliveries);
      setInbound(data.inbound);
    }
  }

  async function createSub() {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/partner-webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create_subscription",
        name,
        targetUrl,
        eventTypes: ["lead.created", "partner.test", "appointment.booked"],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? data.error ?? "Create failed");
      return;
    }
    setSubs((s) => [data.subscription, ...s]);
    setMessage(
      `Subscription created — signing secret ${data.subscription.secret.slice(0, 12)}… (store securely)`,
    );
  }

  async function emitTest(subscriptionId?: string) {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/partner-webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "emit_test", subscriptionId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Emit failed");
      return;
    }
    setMessage(`Enqueued ${data.enqueued} delivery job(s) — success only on HTTP 2xx`);
    await refresh();
  }

  async function ensureSecret(rotate = false) {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/partner-webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ensure_inbound_secret", rotate }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Secret failed");
      return;
    }
    setInboundSecret(data.secret);
    setMessage(data.rotated ? "Inbound secret rotated" : "Inbound secret ready");
  }

  return (
    <div className="flex flex-col gap-8">
      {message ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-lg font-medium">Event catalog</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {props.catalog.map((e) => (
            <li
              key={e.type}
              className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm"
            >
              <div className="font-mono text-xs">{e.type}</div>
              <p className="mt-1 text-[var(--lo-fg-muted)]">{e.description}</p>
              <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">{e.zapierHint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Outbound subscriptions</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="min-w-[280px] flex-1 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2 font-mono text-sm"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://hooks.zapier.com/..."
          />
          <Button type="button" onClick={() => void createSub()}>
            Add subscription
          </Button>
          <Button type="button" variant="secondary" onClick={() => void emitTest()}>
            Emit test
          </Button>
        </div>
        {subs.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">
            No outbound hooks yet — point Zapier Catch Hook or n8n Webhook at a URL.
          </p>
        ) : (
          <ul className="space-y-2">
            {subs.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge>{s.enabled ? "enabled" : "disabled"}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--lo-fg-muted)]">
                  {s.targetUrl}
                </p>
                <p className="mt-1 text-xs">
                  Events: {s.eventTypes.join(", ")}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => void emitTest(s.id)}
                >
                  Test this hook
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Deliveries</h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">No deliveries yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
            {deliveries.map((d) => (
              <li key={d.id} className="px-3 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{d.eventType}</span>
                  <Badge>{d.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">
                  attempts {d.attemptCount}
                  {d.lastStatusCode != null ? ` · HTTP ${d.lastStatusCode}` : ""}
                  {d.lastError ? ` · ${d.lastError}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Inbound partner webhooks</h2>
        <p className="mb-2 text-sm text-[var(--lo-fg-muted)]">
          POST signed events to{" "}
          <code className="font-mono text-xs">{props.inboundPath}</code>
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void ensureSecret(false)}>
            Show inbound secret
          </Button>
          <Button type="button" variant="secondary" onClick={() => void ensureSecret(true)}>
            Rotate secret
          </Button>
        </div>
        {inboundSecret ? (
          <p className="mb-3 rounded-md border border-[var(--lo-border)] px-3 py-2 font-mono text-xs">
            {inboundSecret}
          </p>
        ) : null}
        {inbound.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">No inbound events yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
            {inbound.map((e) => (
              <li key={e.id} className="px-3 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span>
                    {e.partner} · {e.eventType}
                  </span>
                  <Badge>{e.status}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--lo-fg-muted)]">
                  {e.eventId}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
