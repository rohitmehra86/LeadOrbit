"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdIntegration,
  Campaign,
  CampaignPerformance,
  CreativeAsset,
  FormDefinition,
  Funnel,
  LandingPage,
} from "@leadorbit/domain";
import { appendUtmToUrl } from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  campaigns: Campaign[];
  forms: FormDefinition[];
  pages: LandingPage[];
  funnels: Funnel[];
  creatives: CreativeAsset[];
  integrations: AdIntegration[];
  performance: CampaignPerformance[];
};

export function MarketingConsole(props: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const perfMap = new Map(props.performance.map((p) => [p.campaignId, p]));

  async function createCampaign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        objective: fd.get("objective") || "lead_gen",
        adCopy: fd.get("adCopy") || "",
        templateKey: fd.get("templateKey") || null,
        status: "draft",
        abTestEnabled: fd.get("abTest") === "on",
        budget: {
          currency: "USD",
          dailyCents: Number(fd.get("dailyBudget") || 0) * 100 || null,
          totalCents: null,
        },
        utmSource: fd.get("utmSource") || "leadorbit",
        utmMedium: fd.get("utmMedium") || "campaign",
      }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  async function duplicate(id: string) {
    await fetch(`/api/v1/orgs/${props.orgId}/campaigns/${id}/duplicate`, {
      method: "POST",
    });
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/v1/orgs/${props.orgId}/campaigns/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function suggestCopy() {
    const res = await fetch(`/api/v1/orgs/${props.orgId}/campaigns/ai-suggest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Lead gen ad for local real estate" }),
    });
    const data = (await res.json()) as {
      item: { status: string; reason: string; suggestions: string[] };
    };
    setAiNote(
      `${data.item.status}: ${data.item.reason}` +
        (data.item.suggestions.length
          ? ` — ${data.item.suggestions.join(" | ")}`
          : ""),
    );
  }

  async function authorize(network: "meta" | "google_ads") {
    await fetch(`/api/v1/orgs/${props.orgId}/ad-integrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network }),
    });
    router.refresh();
  }

  async function addCreative(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/creatives`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        contentType: fd.get("contentType") || "image/png",
        storagePath: fd.get("storagePath") || `local://creatives/${Date.now()}`,
        tags: String(fd.get("tags") || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  async function createFunnel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/funnels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        campaignId: fd.get("campaignId") || null,
        steps: [
          {
            id: crypto.randomUUID(),
            kind: "page",
            pageId: props.pages[0]?.id ?? null,
            formId: null,
            name: "Landing",
            position: 0,
          },
          {
            id: crypto.randomUUID(),
            kind: "form",
            pageId: null,
            formId: props.forms[0]?.id ?? null,
            name: "Capture",
            position: 1,
          },
          {
            id: crypto.randomUUID(),
            kind: "thank_you",
            pageId: null,
            formId: null,
            name: "Thank you",
            position: 2,
          },
        ],
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-6">
        <form
          onSubmit={createCampaign}
          className="grid gap-3 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4"
        >
          <h2 className="text-lg font-medium">New campaign</h2>
          <input
            name="name"
            required
            placeholder="Campaign name"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <select
            name="objective"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="lead_gen">Lead gen</option>
            <option value="traffic">Traffic</option>
            <option value="conversions">Conversions</option>
            <option value="brand_awareness">Brand awareness</option>
            <option value="engagement">Engagement</option>
          </select>
          <textarea
            name="adCopy"
            placeholder="Ad copy"
            rows={3}
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="utmSource"
              placeholder="UTM source"
              defaultValue="meta"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="utmMedium"
              placeholder="UTM medium"
              defaultValue="cpc"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="dailyBudget"
              type="number"
              min={0}
              placeholder="Daily budget USD"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              name="templateKey"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="">No template</option>
              <option value="real_estate">Real estate</option>
              <option value="lead_gen">Lead gen</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--lo-fg-muted)]">
            <input name="abTest" type="checkbox" /> A/B testing scaffold
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Create campaign</Button>
            <Button type="button" onClick={suggestCopy}>
              AI copy hook
            </Button>
          </div>
          {aiNote ? (
            <p className="text-xs text-[var(--lo-fg-muted)]">{aiNote}</p>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </form>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Campaigns</h2>
          {props.campaigns.length === 0 ? (
            <div className="lo-empty">
              <p className="lo-muted">
                No campaigns yet. Create one to generate UTMs and track events,
                or launch a pack from the AI Assistant.
              </p>
            </div>
          ) : (
            <div className="lo-table-wrap">
              <table className="lo-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Performance</th>
                    <th>Landing</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {props.campaigns.map((c) => {
                    const perf = perfMap.get(c.id);
                    const landing =
                      props.pages.find((p) => p.id === c.landingPageId) ??
                      props.pages[0];
                    const utmUrl = landing
                      ? appendUtmToUrl(
                          `/p/${props.orgId}/${landing.slug}`,
                          c.utm,
                        )
                      : appendUtmToUrl(`/p/${props.orgId}/preview`, c.utm);
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          <div className="lo-muted text-xs">
                            {c.objective} · {c.utm.utmSource}/
                            {c.utm.utmMedium}
                            {c.abTestEnabled ? " · A/B" : ""}
                          </div>
                          {c.adCopy ? (
                            <div className="mt-1 line-clamp-2 text-xs text-[var(--lo-fg-muted)]">
                              {c.adCopy}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <Badge>{c.status}</Badge>
                        </td>
                        <td className="lo-muted whitespace-nowrap text-xs">
                          Views {perf?.pageViews ?? 0}
                          <br />
                          Submits {perf?.formSubmits ?? 0}
                          <br />
                          Conv {perf?.conversions ?? 0}
                        </td>
                        <td>
                          <code className="break-all text-[0.65rem] text-[var(--lo-fg-muted)]">
                            {utmUrl}
                          </code>
                        </td>
                        <td>
                          <div className="flex flex-col gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => setStatus(c.id, "active")}
                            >
                              Activate
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => setStatus(c.id, "paused")}
                            >
                              Pause
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => duplicate(c.id)}
                            >
                              Duplicate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Ad integrations</h2>
          <p className="text-xs text-[var(--lo-fg-muted)]">
            Meta / Google adapters are authorize-flow stubs. Without credentials
            status stays <code>pending_configuration</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => authorize("meta")}>
              Connect Meta
            </Button>
            <Button type="button" onClick={() => authorize("google_ads")}>
              Connect Google Ads
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {props.integrations.length === 0 ? (
              <li className="text-[var(--lo-fg-muted)]">None configured</li>
            ) : (
              props.integrations.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between gap-2 rounded-md border border-[var(--lo-border)] px-3 py-2"
                >
                  <span>{i.network}</span>
                  <Badge>{i.status}</Badge>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Creative library</h2>
          <form onSubmit={addCreative} className="grid gap-2">
            <input
              name="name"
              required
              placeholder="Asset name"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="storagePath"
              placeholder="local://path or URL"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="tags"
              placeholder="tags,comma,separated"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <Button type="submit">Add asset metadata</Button>
          </form>
          <ul className="space-y-2 text-sm">
            {props.creatives.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                {c.name} · {c.contentType}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Funnels</h2>
          <form onSubmit={createFunnel} className="grid gap-2">
            <input
              name="name"
              required
              placeholder="Funnel name"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              name="campaignId"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="">No campaign</option>
              {props.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button type="submit">Create lead-gen funnel</Button>
          </form>
          <ul className="space-y-2 text-sm">
            {props.funnels.map((f) => (
              <li
                key={f.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                {f.name} · {f.steps.length} steps · {f.status}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
