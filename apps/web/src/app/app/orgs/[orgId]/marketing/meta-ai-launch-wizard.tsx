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

export function MetaAiLaunchWizard({ orgId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"brief" | "review" | "done">("brief");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [draft, setDraft] = useState<DraftResponse["item"] | null>(null);
  const [enableSpend, setEnableSpend] = useState(false);
  const [resultDetail, setResultDetail] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<string | null>(null);
  const [metaIds, setMetaIds] = useState<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
  } | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch(`/api/v1/orgs/${orgId}/meta/status`)
      .then((r) => r.json())
      .then((d: { item: MetaStatus }) => setStatus(d.item))
      .catch(() => setStatus(null));
  }, [open, orgId]);

  async function onPrepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "prepare",
        brief: {
          businessOrOffer: fd.get("businessOrOffer"),
          geo: fd.get("geo"),
          budgetAmount: Number(fd.get("budgetAmount")),
          budgetType: fd.get("budgetType") || "daily",
          currency: fd.get("currency") || "USD",
          objective: "lead_gen",
          audienceBasics: fd.get("audienceBasics") || null,
          creativeText: fd.get("creativeText") || null,
          creativeImageUrl: fd.get("creativeImageUrl") || null,
        },
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = (await res.json()) as DraftResponse;
    setDraft(data.item);
    const ms = data.item.metaStatus as MetaStatus & { status?: string };
    setStatus({
      credentialStatus: ms.credentialStatus ?? ms.status ?? "pending_configuration",
      detail: ms.detail,
      present: ms.present ?? {},
      setupHints: ms.setupHints ?? [],
      integration: ms.integration ?? null,
    });
    setStep("review");
  }

  async function onApprove() {
    if (!draft) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        approved: true,
        enableSpend,
        plan: { ...draft.plan, enableSpend },
        campaignId: draft.local.campaignId,
      }),
    });
    setLoading(false);
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

    // 201 = Meta created; 409 = pending_configuration; 502 = Meta API error
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
        setStatus({ ...status, setupHints: data.setupHints, present: data.present ?? status.present });
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
  }

  function reset() {
    setOpen(false);
    setStep("brief");
    setDraft(null);
    setError(null);
    setEnableSpend(false);
    setResultDetail(null);
    setResultStatus(null);
    setMetaIds(null);
    setHttpStatus(null);
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Launch with Meta (AI)
      </Button>
    );
  }

  return (
    <div className="lo-meta-wizard" role="dialog" aria-label="Launch with Meta AI">
      <div className="lo-panel-head-row" style={{ marginBottom: "0.75rem" }}>
        <div>
          <h2>Launch with Meta (AI)</h2>
          <p className="lo-muted text-sm">
            Guided lead-gen setup. Approval required before any Meta create or
            spend — never silent.
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
        </div>
      ) : null}

      {step === "brief" ? (
        <form onSubmit={onPrepare} className="lo-launch-form">
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Business / offer
            <input
              name="businessOrOffer"
              required
              minLength={4}
              placeholder="Condo leads for first-time buyers"
            />
          </label>
          <label className="lo-field">
            Geo / city
            <input name="geo" required placeholder="Bangalore" />
          </label>
          <label className="lo-field">
            Budget amount
            <input
              name="budgetAmount"
              type="number"
              min={1}
              step="1"
              required
              defaultValue={25}
            />
          </label>
          <label className="lo-field">
            Budget type
            <select name="budgetType" defaultValue="daily">
              <option value="daily">Daily</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </label>
          <label className="lo-field">
            Currency
            <input name="currency" defaultValue="USD" />
          </label>
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Audience basics (optional)
            <input
              name="audienceBasics"
              placeholder="Home buyers 28–45 interested in apartments"
            />
          </label>
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Ad primary text (optional)
            <textarea
              name="creativeText"
              rows={2}
              placeholder="AI will draft if empty"
            />
          </label>
          <label className="lo-field" style={{ gridColumn: "1 / -1" }}>
            Image URL (optional)
            <input name="creativeImageUrl" placeholder="https://…" />
          </label>
          <p className="lo-muted text-xs" style={{ gridColumn: "1 / -1" }}>
            Objective is fixed to lead generation. A capture page is published
            locally so Meta has a landing URL.
          </p>
          <div className="lo-launch-actions">
            <Button type="submit" disabled={loading}>
              {loading ? "Building plan…" : "Propose Meta plan"}
            </Button>
          </div>
        </form>
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
              <dd>Lead generation</dd>
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
              <dd>{draft.plan.headline}</dd>
            </div>
            <div>
              <dt>Primary text</dt>
              <dd>{draft.plan.primaryText}</dd>
            </div>
            <div>
              <dt>Landing</dt>
              <dd>
                <a
                  href={draft.local.publicPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lo-landing-label"
                >
                  {draft.local.pageSlug}
                </a>
              </dd>
            </div>
          </dl>
          <ul className="lo-muted mt-2 list-disc pl-5 text-xs">
            {draft.plan.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="lo-muted mt-3 text-sm">
            <strong>Local:</strong> capture page already published for this plan.
            That is not a Meta ad. <strong>Meta:</strong> only created after
            Approve when all META_ADS_* are set (HTTP 201 + campaign_id).
          </p>
          {status?.credentialStatus !== "ready" ? (
            <p className="lo-muted mt-2 text-sm">
              Credentials incomplete — Approve returns HTTP 409{" "}
              <code>pending_configuration</code> (Meta API not called). Not a
              successful create.
            </p>
          ) : (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={enableSpend}
                onChange={(e) => setEnableSpend(e.target.checked)}
              />
              <span>
                Enable spend on Meta (ACTIVE). Leave unchecked to create{" "}
                <strong>PAUSED</strong> — safer default.
              </span>
            </label>
          )}
          <div className="lo-launch-actions mt-4">
            <Button type="button" disabled={loading} onClick={onApprove}>
              {loading ? "Submitting…" : "Approve Meta launch"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("brief")}
            >
              Edit essentials
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
              Local Launch Pack campaign id: <code>{draft.local.campaignId}</code>{" "}
              (LeadOrbit only — separate from Meta).
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
                  <code>{metaIds.adset_id ?? "—"}</code>
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
                Meta was <strong>not</strong> created. Add on Vercel Production,
                Redeploy, Approve again:
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
              Confirm the new row in Meta Ads Manager (search by campaign name or
              campaign_id). PAUSED ads are easy to miss if the UI filters Active
              only.
            </p>
          ) : null}
          <div className="lo-card-actions">
            <Link href={`/app/orgs/${orgId}/results`}>
              <Button type="button">View Results</Button>
            </Link>
            <Button type="button" variant="secondary" onClick={reset}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="lo-error mt-3">{error}</p> : null}
    </div>
  );
}
