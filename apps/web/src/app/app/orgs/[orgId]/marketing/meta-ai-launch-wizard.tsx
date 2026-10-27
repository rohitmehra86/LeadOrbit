"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MetaLaunchPlan } from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type MetaStatus = {
  credentialStatus: string;
  detail: string;
  present: Record<string, boolean>;
  setupHints: string[];
  integration: { status: string; lastError: string | null } | null;
  connection?: {
    adAccountId?: string | null;
    pageId?: string | null;
    pixelId?: string | null;
    leadGenFormId?: string | null;
  } | null;
};

type DraftResponse = {
  item: {
    plan: MetaLaunchPlan;
    local: {
      campaignId: string;
      publicPath: string;
      pageSlug: string;
      published: boolean;
    };
    metaStatus: MetaStatus;
  };
  status: string;
  message: string;
};

type Props = { orgId: string };

type DestinationMode = "website" | "instant_form";

export function MetaAiLaunchWizard({ orgId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"brief" | "creative" | "review" | "done">(
    "brief",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDetail, setAiDetail] = useState<string | null>(null);
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [draft, setDraft] = useState<DraftResponse["item"] | null>(null);
  const [enableSpend, setEnableSpend] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [resultDetail, setResultDetail] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<string | null>(null);
  const [metaIds, setMetaIds] = useState<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
  } | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  const [destination, setDestination] = useState<DestinationMode>("website");
  const [businessOrOffer, setBusinessOrOffer] = useState("");
  const [geo, setGeo] = useState("");
  const [budgetAmount, setBudgetAmount] = useState(25);
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [currency, setCurrency] = useState("USD");
  const [audienceBasics, setAudienceBasics] = useState("");
  const [creativeImageUrl, setCreativeImageUrl] = useState("");
  const [landingOverride, setLandingOverride] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [callToAction, setCallToAction] = useState<"LEARN_MORE" | "SIGN_UP">(
    "SIGN_UP",
  );

  useEffect(() => {
    if (!open) return;
    void fetch(`/api/v1/orgs/${orgId}/meta/status`)
      .then((r) => r.json())
      .then((d: { item: MetaStatus }) => setStatus(d.item))
      .catch(() => setStatus(null));
  }, [open, orgId]);

  async function generateAiCopy() {
    setAiLoading(true);
    setAiDetail(null);
    setError(null);
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/ai-copy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessOrOffer,
        geo,
        audienceBasics: audienceBasics || null,
        landingPageUrl: landingOverride || null,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      item?: {
        status?: string;
        detail?: string;
        suggestion?: {
          primaryText?: string;
          headline?: string;
          description?: string;
          callToAction?: "LEARN_MORE" | "SIGN_UP";
          creativeNotes?: string[];
        } | null;
      };
    } | null;
    setAiLoading(false);
    const suggestion = data?.item?.suggestion;
    if (suggestion?.primaryText) {
      setPrimaryText(suggestion.primaryText);
      setHeadline(suggestion.headline ?? "");
      setDescription(suggestion.description ?? "");
      if (suggestion.callToAction) setCallToAction(suggestion.callToAction);
    }
    setAiDetail(
      data?.item?.detail ??
        (res.ok ? "Copy updated" : "AI copy unavailable — edit manually"),
    );
  }

  async function onPrepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (destination === "website") {
      const hasPixel =
        Boolean(status?.present?.ORG_META_PIXEL) ||
        Boolean(status?.connection?.pixelId) ||
        (Boolean(status?.present?.META_ADS_ALLOW_ENV_FALLBACK) &&
          Boolean(status?.present?.META_ADS_PIXEL_ID));
      if (!hasPixel) {
        setError(
          "Website lead destination requires a Meta Pixel on this org. Select one in Connect Meta (same ad account), or switch to Instant Form.",
        );
        return;
      }
    }
    if (destination === "instant_form") {
      const formId = status?.connection?.leadGenFormId;
      if (!formId) {
        setError(
          "Instant Form destination requires a lead form on the connected Page. Select one in Connect Meta.",
        );
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orgs/${orgId}/meta/launch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          brief: {
            businessOrOffer,
            geo,
            budgetAmount,
            budgetType,
            currency,
            objective: "lead_gen",
            audienceBasics: audienceBasics || null,
            creativeText: primaryText || null,
            creativeImageUrl: creativeImageUrl || null,
            landingPageUrl:
              destination === "website"
                ? landingOverride || null
                : null,
            leadGenFormId:
              destination === "instant_form"
                ? status?.connection?.leadGenFormId ?? null
                : null,
          },
        }),
      });
      if (!res.ok) {
        const raw = await res.text();
        setError(raw || `Prepare failed (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as DraftResponse;
      setDraft(data.item);
      const ms = data.item.metaStatus as MetaStatus & { status?: string };
      setStatus((prev) => ({
        credentialStatus: ms.credentialStatus ?? ms.status ?? "pending_configuration",
        detail: ms.detail,
        present: ms.present ?? {},
        setupHints: ms.setupHints ?? [],
        integration: ms.integration ?? null,
        connection: ms.connection ?? prev?.connection ?? null,
      }));
      // Refresh full status so Pixel / Form connection fields stay available
      void fetch(`/api/v1/orgs/${orgId}/meta/status`)
        .then((r) => r.json())
        .then((d: { item: MetaStatus }) => setStatus(d.item))
        .catch(() => undefined);
      if (!primaryText) setPrimaryText(data.item.plan.primaryText);
      if (!headline) setHeadline(data.item.plan.headline);
      setStep("creative");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Prepare request failed — check network and try again",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onApprove(opts?: { resumeCampaignId?: string | null }) {
    if (!draft) return;
    if (!confirmPublish) {
      setError("Confirm publication before Approve — checkbox required.");
      return;
    }
    setError(null);
    setLoading(true);
    const resumeMeta =
      opts?.resumeCampaignId?.trim()
        ? { campaign_id: opts.resumeCampaignId.trim() }
        : undefined;
    const plan: MetaLaunchPlan = {
      ...draft.plan,
      primaryText: primaryText || draft.plan.primaryText,
      headline: headline || draft.plan.headline,
      callToAction,
      enableSpend,
      leadGenFormId:
        destination === "instant_form"
          ? status?.connection?.leadGenFormId ?? draft.plan.leadGenFormId
          : draft.plan.leadGenFormId,
      landingPageUrl:
        destination === "instant_form" ? null : draft.plan.landingPageUrl,
      creativeImageUrl: creativeImageUrl || draft.plan.creativeImageUrl,
    };
    try {
      const res = await fetch(`/api/v1/orgs/${orgId}/meta/launch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          approved: true,
          enableSpend,
          plan,
          campaignId: draft.local.campaignId,
          resumeMeta,
        }),
      });
      setHttpStatus(res.status);
      const data = (await res.json().catch(() => null)) as {
        status?: string;
        detail?: string;
        meta_created?: boolean;
        campaign_id?: string | null;
        adset_id?: string | null;
        ad_id?: string | null;
        meta?: {
          campaign_id?: string | null;
          adset_id?: string | null;
          ad_id?: string | null;
        };
        setupHints?: string[];
        present?: Record<string, boolean>;
        item?: { status?: string; detail?: string };
      } | null;

      if (res.status === 201 || res.status === 409 || res.status === 502) {
        const st = data?.status ?? data?.item?.status ?? "error";
        setResultStatus(st);
        setResultDetail(data?.detail ?? data?.item?.detail ?? res.statusText);
        setMetaIds({
          campaign_id: data?.campaign_id ?? data?.meta?.campaign_id ?? null,
          adset_id: data?.adset_id ?? data?.meta?.adset_id ?? null,
          ad_id: data?.ad_id ?? data?.meta?.ad_id ?? null,
        });
        if (data?.setupHints && status) {
          setStatus({
            ...status,
            setupHints: data.setupHints,
            present: data.present ?? status.present,
          });
        }
        setStep("done");
        router.refresh();
        return;
      }

      setError(
        data?.detail ??
          (data ? JSON.stringify(data) : null) ??
          `HTTP ${res.status}`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Approve request failed — check network and try again",
      );
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOpen(false);
    setStep("brief");
    setDraft(null);
    setError(null);
    setEnableSpend(false);
    setConfirmPublish(false);
    setResultDetail(null);
    setResultStatus(null);
    setMetaIds(null);
    setHttpStatus(null);
    setAiDetail(null);
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Launch with Meta (AI)
      </Button>
    );
  }

  const hasPixel =
    Boolean(status?.present?.ORG_META_PIXEL) ||
    Boolean(status?.connection?.pixelId) ||
    (Boolean(status?.present?.META_ADS_ALLOW_ENV_FALLBACK) &&
      Boolean(status?.present?.META_ADS_PIXEL_ID));

  return (
    <div className="lo-meta-wizard" role="dialog" aria-label="Launch with Meta AI">
      <div className="lo-panel-head-row" style={{ marginBottom: "0.75rem" }}>
        <div>
          <h2>Launch with Meta (AI)</h2>
          <p className="lo-muted text-sm">
            Guided lead-gen setup. Approval required before any Meta create or
            spend — never silent. Objects are created <strong>PAUSED</strong>{" "}
            unless you explicitly enable spend.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={reset}>
          Close
        </Button>
      </div>

      {status ? (
        <div className="lo-meta-status-strip">
          <span className="lo-channel-status">
            <span
              className={`lo-status-dot ${
                status.credentialStatus === "ready" ? "is-ok" : "is-warn"
              }`}
            />
            Meta creds:{" "}
            {(status.credentialStatus ?? "pending_configuration").replace(
              /_/g,
              " ",
            )}
          </span>
          <span className="lo-muted text-xs">{status.detail}</span>
          {status.connection?.adAccountId ? (
            <span className="lo-muted text-xs">
              act {status.connection.adAccountId}
              {status.connection.pageId
                ? ` · page ${status.connection.pageId}`
                : ""}
              {status.connection.pixelId
                ? ` · pixel ${status.connection.pixelId}`
                : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {step === "brief" ? (
        <form onSubmit={onPrepare} className="lo-launch-form">
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Destination
            <select
              value={destination}
              onChange={(e) =>
                setDestination(e.target.value as DestinationMode)
              }
            >
              <option value="website">Website leads (Pixel + landing URL)</option>
              <option value="instant_form">Instant Form (ON_AD)</option>
            </select>
          </label>
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Business / offer
            <input
              value={businessOrOffer}
              onChange={(e) => setBusinessOrOffer(e.target.value)}
              required
              minLength={4}
              placeholder="Condo leads for first-time buyers"
            />
          </label>
          <label className="lo-field">
            Geo / city
            <input
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              required
              placeholder="Bangalore"
            />
          </label>
          <label className="lo-field">
            Budget amount
            <input
              type="number"
              min={1}
              step="1"
              required
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(Number(e.target.value))}
            />
          </label>
          <label className="lo-field">
            Budget type
            <select
              value={budgetType}
              onChange={(e) =>
                setBudgetType(e.target.value as "daily" | "lifetime")
              }
            >
              <option value="daily">Daily</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </label>
          <label className="lo-field">
            Currency
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Audience basics (optional)
            <input
              value={audienceBasics}
              onChange={(e) => setAudienceBasics(e.target.value)}
              placeholder="Home buyers 28–45 interested in apartments"
            />
          </label>
          {destination === "website" ? (
            <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
              Landing URL override (optional)
              <input
                value={landingOverride}
                onChange={(e) => setLandingOverride(e.target.value)}
                placeholder="Leave blank to use auto-published LeadOrbit page"
              />
            </label>
          ) : (
            <p className="lo-muted text-xs" style={{ gridColumn: "1 / -1" }}>
              Instant Form id:{" "}
              <code>{status?.connection?.leadGenFormId ?? "not selected"}</code>
            </p>
          )}
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Image URL (optional — must already be publicly reachable by Meta)
            <input
              value={creativeImageUrl}
              onChange={(e) => setCreativeImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <p className="lo-muted text-xs" style={{ gridColumn: "1 / -1" }}>
            Objective is fixed to Meta <code>OUTCOME_LEADS</code>. Unsupported
            objectives are not silently remapped.
          </p>
          {destination === "website" && !hasPixel ? (
            <p className="lo-error text-sm" style={{ gridColumn: "1 / -1" }}>
              Select a Meta Pixel in{" "}
              <Link href={`/app/orgs/${orgId}/settings/meta-connect`}>
                Connect Meta
              </Link>{" "}
              before website lead publish.
            </p>
          ) : null}
          <div className="lo-launch-actions">
            <Button type="submit" disabled={loading}>
              {loading ? "Building plan…" : "Continue to creative"}
            </Button>
          </div>
        </form>
      ) : null}

      {step === "creative" && draft ? (
        <div className="lo-meta-review">
          <div className="flex flex-wrap items-center gap-2">
            <strong>Ad creative</strong>
            <Badge>editable</Badge>
          </div>
          <p className="lo-muted mt-1 text-sm">
            Generate with AI, then edit. AI copy never bypasses validation or
            auto-publishes.
          </p>
          <div className="lo-launch-actions mt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={aiLoading}
              onClick={() => void generateAiCopy()}
            >
              {aiLoading ? "Generating…" : "Generate AI copy"}
            </Button>
          </div>
          {aiDetail ? <p className="lo-muted mt-2 text-xs">{aiDetail}</p> : null}
          <div className="lo-launch-form mt-3">
            <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
              Primary text
              <textarea
                rows={3}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                required
              />
            </label>
            <label className="lo-field">
              Headline
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                required
              />
            </label>
            <label className="lo-field">
              Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="lo-field">
              Call to action
              <select
                value={callToAction}
                onChange={(e) =>
                  setCallToAction(e.target.value as "LEARN_MORE" | "SIGN_UP")
                }
              >
                <option value="SIGN_UP">SIGN_UP</option>
                <option value="LEARN_MORE">LEARN_MORE</option>
              </select>
            </label>
          </div>
          <div className="lo-muted mt-3 rounded border border-[var(--lo-border)] p-3 text-sm">
            <strong>Preview</strong>
            <p className="mt-1 font-medium">{headline || "Headline"}</p>
            <p className="mt-1">{primaryText || "Primary text"}</p>
            {description ? <p className="lo-muted mt-1 text-xs">{description}</p> : null}
            <p className="mt-2 text-xs">CTA: {callToAction}</p>
          </div>
          <div className="lo-launch-actions mt-4">
            <Button type="button" onClick={() => setStep("review")}>
              Review campaign
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("brief")}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && draft ? (
        <div className="lo-meta-review">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{draft.plan.name}</strong>
            <Badge>needs approval</Badge>
          </div>
          <dl className="lo-meta-dl">
            <div>
              <dt>Objective</dt>
              <dd>OUTCOME_LEADS</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{destination === "website" ? "Website + Pixel" : "Instant Form"}</dd>
            </div>
            <div>
              <dt>Ad account</dt>
              <dd>
                <code>{status?.connection?.adAccountId ?? "—"}</code>
              </dd>
            </div>
            <div>
              <dt>Page</dt>
              <dd>
                <code>{status?.connection?.pageId ?? "—"}</code>
              </dd>
            </div>
            <div>
              <dt>Pixel / Form</dt>
              <dd>
                <code>
                  {destination === "website"
                    ? status?.connection?.pixelId ?? "missing"
                    : status?.connection?.leadGenFormId ?? "missing"}
                </code>
              </dd>
            </div>
            <div>
              <dt>Geo</dt>
              <dd>{draft.plan.geo}</dd>
            </div>
            <div>
              <dt>Budget</dt>
              <dd>
                {draft.plan.budgetType} {draft.plan.currency}{" "}
                {draft.plan.budgetAmount}
              </dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{draft.plan.audienceSummary}</dd>
            </div>
            <div>
              <dt>Headline</dt>
              <dd>{headline}</dd>
            </div>
            <div>
              <dt>Primary text</dt>
              <dd>{primaryText}</dd>
            </div>
            <div>
              <dt>Landing</dt>
              <dd>
                {destination === "instant_form" ? (
                  "ON_AD Instant Form"
                ) : (
                  <a
                    href={draft.local.publicPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lo-landing-label"
                  >
                    {draft.local.pageSlug}
                  </a>
                )}
              </dd>
            </div>
          </dl>
          <ul className="lo-muted mt-2 list-disc pl-5 text-xs">
            {draft.plan.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {status?.credentialStatus !== "ready" ? (
            <p className="lo-muted mt-2 text-sm">
              Connect Meta first (Settings → Connect Meta) so Approve can create
              on this org&apos;s ad account. Without it, Approve returns HTTP 409{" "}
              <code>pending_configuration</code> (Meta API not called).
            </p>
          ) : (
            <>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmPublish}
                  onChange={(e) => setConfirmPublish(e.target.checked)}
                />
                <span>
                  I confirm LeadOrbit should create this campaign, ad set, and
                  ad on Meta for the selected ad account.
                </span>
              </label>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enableSpend}
                  onChange={(e) => setEnableSpend(e.target.checked)}
                />
                <span>
                  Enable spend on Meta (ACTIVE). Leave unchecked to create{" "}
                  <strong>PAUSED</strong> — safer default. Active spend uses{" "}
                  {draft.plan.budgetType} {draft.plan.currency}{" "}
                  {draft.plan.budgetAmount}.
                </span>
              </label>
            </>
          )}
          <div className="lo-launch-actions mt-4">
            <Button
              type="button"
              disabled={loading || (status?.credentialStatus === "ready" && !confirmPublish)}
              onClick={() => onApprove()}
            >
              {loading ? "Submitting…" : "Approve Meta launch"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("creative")}
            >
              Edit creative
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="lo-meta-review">
          <div className="flex flex-wrap items-center gap-2">
            <strong>Meta launch result</strong>
            {resultStatus ? <Badge>{resultStatus}</Badge> : null}
            {httpStatus != null ? (
              <span className="lo-muted text-xs">HTTP {httpStatus}</span>
            ) : null}
          </div>
          <p className="mt-2 text-sm">{resultDetail}</p>
          {draft ? (
            <p className="lo-muted mt-2 text-xs">
              Local Launch Pack campaign id:{" "}
              <code>{draft.local.campaignId}</code>
            </p>
          ) : null}
          {metaIds &&
          (metaIds.campaign_id || metaIds.adset_id || metaIds.ad_id) ? (
            <dl className="lo-meta-dl mt-3">
              <div>
                <dt>campaign_id</dt>
                <dd>
                  <code>{metaIds.campaign_id ?? "—"}</code>
                </dd>
              </div>
              <div>
                <dt>adset_id</dt>
                <dd>
                  <code>{metaIds.ad_id ?? "—"}</code>
                </dd>
              </div>
              <div>
                <dt>ad_id</dt>
                <dd>
                  <code>{metaIds.ad_id ?? "—"}</code>
                </dd>
              </div>
            </dl>
          ) : null}
          {resultStatus === "pending_configuration" && status ? (
            <div className="mt-3">
              <p className="lo-muted text-sm">
                Meta was <strong>not</strong> created. Connect Meta or add
                META_ADS_* on Vercel, then Approve again:
              </p>
              <ul className="lo-muted mt-1 list-disc pl-5 text-xs">
                {status.setupHints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {resultStatus === "created_paused" ||
          resultStatus === "created_active" ? (
            <p className="mt-2 text-sm text-[var(--lo-success)]">
              Confirm in Meta Ads Manager (filter PAUSED if needed). Use the
              campaign management panel to refresh status and insights.
            </p>
          ) : null}
          {resultStatus === "error" && metaIds?.campaign_id && !metaIds.ad_id ? (
            <p className="lo-muted mt-2 text-sm">
              Retry reuses Meta campaign <code>{metaIds.campaign_id}</code> and
              creates a new ad set (previous ad set is not reused).
            </p>
          ) : null}
          <div className="lo-card-actions">
            {resultStatus === "error" && metaIds?.campaign_id && !metaIds.ad_id ? (
              <Button
                type="button"
                disabled={loading}
                onClick={() => {
                  setConfirmPublish(true);
                  void onApprove({ resumeCampaignId: metaIds.campaign_id });
                }}
              >
                {loading ? "Retrying…" : "Retry Meta publish"}
              </Button>
            ) : null}
            {draft ? (
              <Link href={`#meta-campaign-${draft.local.campaignId}`}>
                <Button type="button" variant="secondary">
                  Manage this campaign
                </Button>
              </Link>
            ) : null}
            <Link href={`/app/orgs/${orgId}/results`}>
              <Button type="button">View Results</Button>
            </Link>
            <Button type="button" variant="ghost" onClick={reset}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="lo-error mt-3">{error}</p> : null}
    </div>
  );
}
