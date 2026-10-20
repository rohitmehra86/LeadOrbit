"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
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

function landingForCampaign(
  orgId: string,
  campaign: Campaign,
  pages: LandingPage[],
): { slug: string; label: string; path: string; published: boolean } | null {
  const page =
    pages.find((p) => p.id === campaign.landingPageId) ??
    pages.find((p) => p.campaignId === campaign.id);
  if (!page) return null;
  return {
    slug: page.slug,
    label: page.name || page.slug,
    path: `/p/${orgId}/${page.slug}`,
    published: page.status === "published",
  };
}

function CopyLinkButton({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const absolute =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="lo-landing-link">
      <span className="text-sm text-[var(--lo-fg)]">{label}</span>
      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        className="lo-landing-label"
      >
        Open
      </a>
      <button type="button" className="lo-copy-btn" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function AdChannelCard({
  title,
  network,
  integration,
  onRegisterInterest,
}: {
  title: string;
  network: "meta" | "google_ads";
  integration?: AdIntegration;
  onRegisterInterest: (network: "meta" | "google_ads") => void;
}) {
  const status = integration?.status ?? "not_connected";
  const fullyConnected = status === "connected";
  const stubReady = status === "authorized_stub";
  const label = fullyConnected
    ? "Connected"
    : stubReady
      ? "Waiting on live credentials"
      : "Credentials required";
  return (
    <div className="lo-channel-card">
      <div className="lo-channel-card-head">
        <strong>{title}</strong>
        <span className="lo-channel-status">
          <span
            className={`lo-status-dot ${fullyConnected ? "is-ok" : "is-warn"}`}
            aria-hidden
          />
          {label}
        </span>
      </div>
      <p className="lo-muted text-xs">
        {fullyConnected
          ? "Account linked. Campaign push uses your configured credentials."
          : "Connect when Meta/Google credentials are ready. Never shown as live without keys."}
      </p>
      {!fullyConnected ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => onRegisterInterest(network)}
        >
          Register connect intent
        </Button>
      ) : null}
      {integration?.lastError ? (
        <p className="lo-muted mt-2 text-xs">{integration.lastError}</p>
      ) : null}
    </div>
  );
}

export function MarketingConsole(props: Props) {
  const router = useRouter();
  /** Marketing always opens Simple — independent of global Simple/Advanced nav cookie. */
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [launchNote, setLaunchNote] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const perfMap = useMemo(
    () => new Map(props.performance.map((p) => [p.campaignId, p])),
    [props.performance],
  );

  const publishedPages = props.pages.filter((p) => p.status === "published").length;
  const activeCampaigns = props.campaigns.filter((c) => c.status === "active").length;

  async function launchPack(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLaunchNote(null);
    setLaunching(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal: fd.get("goal"),
        location: fd.get("location") || null,
        offer: fd.get("offer") || null,
        publish: true,
      }),
    });
    setLaunching(false);
    if (!res.ok) {
      setError((await res.text()) || "Launch Pack failed");
      return;
    }
    const data = (await res.json()) as {
      pack: { name: string; pageSlug: string; publicPath: string; published: boolean };
    };
    setLaunchNote(
      data.pack.published
        ? `Published “${data.pack.name}”. Landing: ${data.pack.pageSlug}`
        : `Draft “${data.pack.name}” created.`,
    );
    e.currentTarget.reset();
    router.refresh();
  }

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
    setShowNewCampaign(false);
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

  async function duplicate(id: string) {
    await fetch(`/api/v1/orgs/${props.orgId}/campaigns/${id}/duplicate`, {
      method: "POST",
    });
    router.refresh();
  }

  async function suggestCopy() {
    const res = await fetch(`/api/v1/orgs/${props.orgId}/campaigns/ai-suggest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Lead gen ad for local growth" }),
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

  const meta = props.integrations.find((i) => i.network === "meta");
  const google = props.integrations.find((i) => i.network === "google_ads");

  return (
    <div className="lo-marketing">
      <div className="lo-stat-grid lo-stat-grid-compact">
        <div className="lo-stat">
          <span className="lo-stat-value">{props.campaigns.length}</span>
          <span className="lo-stat-label">Campaigns</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{activeCampaigns}</span>
          <span className="lo-stat-label">Active</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{publishedPages}</span>
          <span className="lo-stat-label">Live pages</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{props.forms.length}</span>
          <span className="lo-stat-label">Forms</span>
        </div>
      </div>

      <section className="lo-section lo-launch-panel">
        <div className="lo-panel-head-row" style={{ marginBottom: "0.75rem" }}>
          <div>
            <h2>Launch Pack</h2>
            <p className="lo-muted text-sm">
              Describe a goal. LeadOrbit creates campaign, form, and landing page,
              then publishes so you can share a capture link.
            </p>
          </div>
          <Link href={`/app/orgs/${props.orgId}/assistant`}>
            <Button type="button" variant="ghost">
              Open AI Assistant
            </Button>
          </Link>
        </div>
        <form onSubmit={launchPack} className="lo-launch-form">
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Goal
            <input
              name="goal"
              required
              minLength={4}
              placeholder="Generate qualified inbound leads in Bangalore"
            />
          </label>
          <label className="lo-field">
            Location (optional)
            <input name="location" placeholder="Bangalore" />
          </label>
          <label className="lo-field">
            Offer line (optional)
            <input name="offer" placeholder="Book a consult this week" />
          </label>
          <div className="lo-launch-actions">
            <Button type="submit" disabled={launching}>
              {launching ? "Publishing…" : "Launch & publish"}
            </Button>
          </div>
        </form>
        {launchNote ? (
          <p className="mt-3 text-sm text-[var(--lo-success)]">{launchNote}</p>
        ) : null}
        {error ? <p className="lo-error mt-3">{error}</p> : null}
      </section>

      <section className="lo-section">
        <div className="lo-panel-head-row">
          <div>
            <h2>Campaigns</h2>
            <p className="lo-muted text-sm">
              Published pages show a short landing name — copy the full link for
              sharing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/orgs/${props.orgId}/results`}>
              <Button type="button" variant="secondary">
                View Results
              </Button>
            </Link>
            {showAdvancedTools ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowNewCampaign((v) => !v)}
              >
                {showNewCampaign ? "Hide form" : "New campaign"}
              </Button>
            ) : null}
          </div>
        </div>

        {showAdvancedTools && showNewCampaign ? (
          <form onSubmit={createCampaign} className="lo-advanced-form mb-4">
            <h3 className="text-sm font-semibold">Manual campaign</h3>
            <label className="lo-field">
              Name
              <input name="name" required placeholder="Q4 inbound" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="lo-field">
                Objective
                <select name="objective" defaultValue="lead_gen">
                  <option value="lead_gen">Lead gen</option>
                  <option value="traffic">Traffic</option>
                  <option value="conversions">Conversions</option>
                  <option value="brand_awareness">Brand awareness</option>
                  <option value="engagement">Engagement</option>
                </select>
              </label>
              <label className="lo-field">
                Template
                <select name="templateKey" defaultValue="lead_gen">
                  <option value="">None</option>
                  <option value="lead_gen">Lead gen</option>
                  <option value="real_estate">Real estate</option>
                </select>
              </label>
            </div>
            <label className="lo-field">
              Ad copy
              <textarea name="adCopy" rows={2} placeholder="Short offer copy" />
            </label>
            <input type="hidden" name="utmSource" value="leadorbit" />
            <input type="hidden" name="utmMedium" value="campaign" />
            <details className="lo-disclose">
              <summary>UTM &amp; budget (optional)</summary>
              <div className="lo-disclose-body grid gap-3 sm:grid-cols-3">
                <label className="lo-field">
                  UTM source
                  <input name="utmSourceVisible" defaultValue="leadorbit" disabled />
                </label>
                <label className="lo-field">
                  UTM medium
                  <input name="utmMediumVisible" defaultValue="campaign" disabled />
                </label>
                <label className="lo-field">
                  Daily budget (USD)
                  <input name="dailyBudget" type="number" min={0} />
                </label>
              </div>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Create draft</Button>
              <Button type="button" variant="ghost" onClick={suggestCopy}>
                AI copy suggestions
              </Button>
            </div>
            {aiNote ? <p className="lo-muted text-xs">{aiNote}</p> : null}
          </form>
        ) : null}

        {props.campaigns.length === 0 ? (
          <div className="lo-empty">
            <p className="lo-muted">
              No campaigns yet. Use Launch Pack above, or ask the AI Assistant to
              launch a capture page.
            </p>
            <Link href={`/app/orgs/${props.orgId}/assistant`}>
              <Button type="button">Open Assistant</Button>
            </Link>
          </div>
        ) : (
          <ul className="lo-campaign-list">
            {props.campaigns.map((c) => {
              const perf = perfMap.get(c.id);
              const landing = landingForCampaign(props.orgId, c, props.pages);
              return (
                <li key={c.id} className="lo-campaign-row">
                  <div className="lo-campaign-main">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{c.name}</strong>
                      <Badge>{c.status}</Badge>
                      {landing?.published ? (
                        <span className="lo-pill-live">Live</span>
                      ) : (
                        <span className="lo-pill-draft">Draft page</span>
                      )}
                    </div>
                    <p className="lo-muted mt-1 text-xs">
                      {c.objective.replace(/_/g, " ")}
                      {perf
                        ? ` · ${perf.pageViews} views · ${perf.formSubmits} submits · ${perf.conversions} conversions`
                        : null}
                    </p>
                    {landing ? (
                      <div className="mt-2">
                        <CopyLinkButton
                          path={landing.path}
                          label={landing.label}
                        />
                        <p className="lo-muted mt-1 text-[0.7rem]">
                          /{landing.slug}
                        </p>
                      </div>
                    ) : (
                      <p className="lo-muted mt-2 text-xs">
                        No landing page yet — Launch Pack or Page builder.
                      </p>
                    )}
                  </div>
                  <div className="lo-campaign-actions">
                    {c.status !== "active" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setStatus(c.id, "active")}
                      >
                        Activate
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStatus(c.id, "paused")}
                      >
                        Pause
                      </Button>
                    )}
                    {showAdvancedTools ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => duplicate(c.id)}
                      >
                        Duplicate
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="lo-marketing-tools-toggle">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowAdvancedTools((v) => !v)}
        >
          {showAdvancedTools ? "Hide advanced tools" : "Show advanced tools"}
        </Button>
        {!showAdvancedTools ? (
          <p className="lo-muted text-xs">
            Optional channel setup stays hidden until you opt in. Nothing is
            shown as connected without credentials.
          </p>
        ) : null}
      </div>

      {showAdvancedTools ? (
        <section className="lo-section">
          <h2>Ad channels</h2>
          <p className="lo-muted mb-3 text-sm">
            Connect when credentials are ready. Nothing is marked live without
            keys.
          </p>
          <div className="lo-channel-grid">
            <AdChannelCard
              title="Meta Ads"
              network="meta"
              integration={meta}
              onRegisterInterest={authorize}
            />
            <AdChannelCard
              title="Google Ads"
              network="google_ads"
              integration={google}
              onRegisterInterest={authorize}
            />
          </div>
        </section>
      ) : null}

      {showAdvancedTools ? (
        <details className="lo-disclose" open>
          <summary>Creative library & funnels</summary>
          <div className="lo-disclose-body grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Creatives</h3>
              <form onSubmit={addCreative} className="lo-advanced-form">
                <label className="lo-field">
                  Asset name
                  <input name="name" required />
                </label>
                <label className="lo-field">
                  Storage path or URL
                  <input name="storagePath" placeholder="https://… or local://…" />
                </label>
                <label className="lo-field">
                  Tags
                  <input name="tags" placeholder="hero, retargeting" />
                </label>
                <Button type="submit" variant="secondary">
                  Add asset metadata
                </Button>
              </form>
              <ul className="mt-3 space-y-2 text-sm">
                {props.creatives.length === 0 ? (
                  <li className="lo-muted">No creatives yet.</li>
                ) : (
                  props.creatives.map((c) => (
                    <li key={c.id} className="lo-muted">
                      {c.name} · {c.contentType}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Funnels</h3>
              <form onSubmit={createFunnel} className="lo-advanced-form">
                <label className="lo-field">
                  Funnel name
                  <input name="name" required />
                </label>
                <label className="lo-field">
                  Campaign
                  <select name="campaignId">
                    <option value="">None</option>
                    {props.campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="secondary">
                  Create funnel
                </Button>
              </form>
              <ul className="mt-3 space-y-2 text-sm">
                {props.funnels.length === 0 ? (
                  <li className="lo-muted">No funnels yet.</li>
                ) : (
                  props.funnels.map((f) => (
                    <li key={f.id} className="lo-muted">
                      {f.name} · {f.steps.length} steps · {f.status}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </details>
      ) : null}

      {showAdvancedTools ? (
        <div className="lo-card-actions">
          <Link href={`/app/orgs/${props.orgId}/marketing/forms`}>
            <Button type="button" variant="ghost">
              Form builder
            </Button>
          </Link>
          <Link href={`/app/orgs/${props.orgId}/marketing/pages`}>
            <Button type="button" variant="ghost">
              Page builder
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
