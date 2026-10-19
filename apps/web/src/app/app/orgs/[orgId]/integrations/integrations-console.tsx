"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ChannelAdapter,
  IngestionEvent,
  WebhookDelivery,
  WebhookEndpoint,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  endpoints: WebhookEndpoint[];
  channels: ChannelAdapter[];
  events: IngestionEvent[];
  deliveries: WebhookDelivery[];
};

export function IntegrationsConsole(props: Props) {
  const router = useRouter();
  const [secretReveal, setSecretReveal] = useState<string | null>(null);
  const [attrNote, setAttrNote] = useState<string | null>(null);
  const [leadAdsNote, setLeadAdsNote] = useState<string | null>(null);

  async function createEndpoint(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/integrations/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: fd.get("name") || "Inbound webhook" }),
    });
    const data = (await res.json()) as { item: WebhookEndpoint };
    setSecretReveal(data.item.secret);
    e.currentTarget.reset();
    router.refresh();
  }

  async function authorizeLeadAds(network: "meta_lead_ads" | "google_lead_ads") {
    const res = await fetch(`/api/v1/orgs/${props.orgId}/integrations/lead-ads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network, action: "authorize" }),
    });
    const data = (await res.json()) as { item: ChannelAdapter };
    setLeadAdsNote(`${data.item.channel}: ${data.item.status} — ${data.item.lastError}`);
    router.refresh();
  }

  async function pullLeadAds(network: "meta_lead_ads" | "google_lead_ads") {
    const res = await fetch(`/api/v1/orgs/${props.orgId}/integrations/lead-ads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network, action: "pull" }),
    });
    const data = (await res.json()) as {
      item: { status: string; detail: string; imported: number };
    };
    setLeadAdsNote(
      `Pull ${network}: ${data.item.status} (imported=${data.item.imported}) — ${data.item.detail}`,
    );
    router.refresh();
  }

  async function enqueueOutbound(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/integrations/deliveries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetUrl: fd.get("targetUrl"),
        payload: { ping: true },
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  async function markDelivery(id: string, success: boolean) {
    await fetch(`/api/v1/orgs/${props.orgId}/integrations/deliveries/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ success, statusCode: success ? 200 : 500 }),
    });
    router.refresh();
  }

  async function loadAttribution(leadId: string) {
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/attribution/leads/${leadId}`,
    );
    const data = (await res.json()) as {
      item: {
        attribution: { campaignId: string | null; model: string } | null;
        touchpoints: Array<{ channel: string; campaignId: string | null }>;
      };
    };
    setAttrNote(
      data.item.attribution
        ? `${data.item.attribution.model} → campaign ${data.item.attribution.campaignId} · ${data.item.touchpoints.length} touchpoints`
        : "No attribution yet",
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section className="space-y-6">
        <form
          onSubmit={createEndpoint}
          className="grid gap-2 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4"
        >
          <h2 className="text-lg font-medium">Webhook endpoints</h2>
          <input
            name="name"
            placeholder="Endpoint name"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <Button type="submit">Create signed endpoint</Button>
          {secretReveal ? (
            <p className="break-all font-mono text-xs text-[var(--lo-fg-muted)]">
              Secret (store securely): {secretReveal}
            </p>
          ) : null}
        </form>

        <ul className="space-y-2 text-sm">
          {props.endpoints.map((ep) => (
            <li
              key={ep.id}
              className="rounded-md border border-[var(--lo-border)] px-3 py-3"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">{ep.name}</span>
                <Badge>{ep.enabled ? "enabled" : "disabled"}</Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-[var(--lo-fg-muted)]">
                POST /api/v1/public/webhooks/{props.orgId}/{ep.id}
              </p>
              <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">
                Headers: X-LeadOrbit-Timestamp, X-LeadOrbit-Signature
              </p>
            </li>
          ))}
        </ul>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Channel adapters</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => authorizeLeadAds("meta_lead_ads")}>
              Authorize Meta Lead Ads
            </Button>
            <Button
              type="button"
              onClick={() => authorizeLeadAds("google_lead_ads")}
            >
              Authorize Google Lead Ads
            </Button>
            <Button type="button" onClick={() => pullLeadAds("meta_lead_ads")}>
              Pull Meta (stub)
            </Button>
            <Button type="button" onClick={() => pullLeadAds("google_lead_ads")}>
              Pull Google (stub)
            </Button>
          </div>
          {leadAdsNote ? (
            <p className="text-xs text-[var(--lo-fg-muted)]">{leadAdsNote}</p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {props.channels.map((c) => (
              <li
                key={c.id}
                className="flex justify-between gap-2 rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                <span>{c.channel}</span>
                <Badge>{c.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Ingestion audit</h2>
          {props.events.length === 0 ? (
            <p className="text-sm text-[var(--lo-fg-muted)]">
              No ingestion events yet. Submit a signed webhook or public capture.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
              {props.events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border border-[var(--lo-border)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {ev.channel} · {ev.status}
                    </span>
                    <Badge>{ev.duplicateOfEventId ? "dup" : ev.status}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-[var(--lo-fg-muted)]">
                    lead={ev.leadId ?? "—"} campaign={ev.campaignId ?? "—"}
                  </p>
                  {ev.leadId ? (
                    <button
                      type="button"
                      className="mt-1 text-xs underline"
                      onClick={() => loadAttribution(ev.leadId!)}
                    >
                      View attribution
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {attrNote ? (
            <p className="text-xs text-[var(--lo-fg-muted)]">{attrNote}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Delivery status sync</h2>
          <form onSubmit={enqueueOutbound} className="grid gap-2">
            <input
              name="targetUrl"
              required
              placeholder="https://partner.example/hooks"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <Button type="submit">Enqueue outbound (scaffold)</Button>
          </form>
          <ul className="space-y-2 text-sm">
            {props.deliveries.map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                <div className="flex justify-between gap-2">
                  <span>
                    {d.direction} · attempts {d.attemptCount}
                  </span>
                  <Badge>{d.status}</Badge>
                </div>
                {d.direction === "outbound" && d.status !== "delivered" ? (
                  <div className="mt-2 flex gap-2">
                    <Button type="button" onClick={() => markDelivery(d.id, true)}>
                      Mark delivered
                    </Button>
                    <Button type="button" onClick={() => markDelivery(d.id, false)}>
                      Mark failed
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
