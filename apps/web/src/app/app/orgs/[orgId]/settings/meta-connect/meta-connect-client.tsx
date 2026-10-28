"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@leadorbit/ui";

type StatusItem = {
  credentialStatus: string;
  detail: string;
  source?: string;
  oauthRedirectUri?: string;
  connection: {
    status: string;
    adAccountId: string | null;
    pageId: string | null;
    pixelId?: string | null;
    leadGenFormId?: string | null;
    connectedAt: string | null;
    tokenExpiresAt: string | null;
  } | null;
  connectionStatus?: string;
  setupHints?: string[];
  externalChecklist?: Array<{ label: string; href: string }>;
};

type AssetOption = { id: string; name: string; status?: string };

type Props = {
  orgId: string;
  initialStep: "status" | "pick" | "done";
  nonce: string | null;
  connectedFlash: boolean;
  errorFlash: string | null;
};

export function MetaConnectClient({
  orgId,
  initialStep,
  nonce,
  connectedFlash,
  errorFlash,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusItem | null>(null);
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(errorFlash);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AssetOption[]>([]);
  const [pages, setPages] = useState<AssetOption[]>([]);
  const [pixels, setPixels] = useState<AssetOption[]>([]);
  const [leadForms, setLeadForms] = useState<AssetOption[]>([]);
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [leadGenFormId, setLeadGenFormId] = useState("");
  const [pixelHint, setPixelHint] = useState<string | null>(null);
  const [formHint, setFormHint] = useState<string | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [activeNonce, setActiveNonce] = useState(nonce);

  async function refreshStatus() {
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/status`);
    if (!res.ok) return null;
    const data = (await res.json()) as { item: StatusItem };
    setStatus(data.item);
    if (data.item.connection?.pixelId) setPixelId(data.item.connection.pixelId);
    if (data.item.connection?.leadGenFormId) {
      setLeadGenFormId(data.item.connection.leadGenFormId);
    }
    return data.item;
  }

  async function persistLeadAssets(
    nextPixelId: string | null,
    nextFormId: string | null,
  ): Promise<boolean> {
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/connection`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pixelId: nextPixelId,
        leadGenFormId: nextFormId,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      setError(
        body.includes("<!DOCTYPE") || body.includes("404")
          ? `Save failed (HTTP ${res.status}). Refresh and try again.`
          : body || `Save failed (HTTP ${res.status})`,
      );
      return false;
    }
    await refreshStatus();
    return true;
  }

  /** Prefer stable /meta/assets; fall back to legacy /meta/oauth/assets. */
  async function fetchMetaAssetsJson(
    query: string,
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; detail: string }> {
    const paths = [
      `/api/v1/orgs/${orgId}/meta/assets?${query}`,
      `/api/v1/orgs/${orgId}/meta/oauth/assets?${query}`,
    ];
    let lastDetail = "Meta asset list unavailable";
    for (const path of paths) {
      try {
        const r = await fetch(path, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const text = await r.text();
        const looksHtml =
          /^\s*</.test(text) ||
          text.includes("<!DOCTYPE") ||
          text.includes("This page could not be found");
        if (looksHtml) {
          lastDetail = `Asset API returned HTML ${r.status} for ${path.split("?")[0]} — paste Pixel ID and Save instead.`;
          continue;
        }
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          lastDetail = `Asset API returned non-JSON (HTTP ${r.status})`;
          continue;
        }
        if (!r.ok) {
          lastDetail =
            (typeof data.detail === "string" && data.detail) ||
            `Asset API HTTP ${r.status}`;
          continue;
        }
        return { ok: true, data };
      } catch (e) {
        lastDetail = e instanceof Error ? e.message : "Asset fetch failed";
      }
    }
    return { ok: false, detail: lastDetail };
  }

  async function loadRelatedAssets(act: string, page: string) {
    if (!act && !page) return;
    const params = new URLSearchParams();
    if (activeNonce) params.set("nonce", activeNonce);
    if (act) params.set("adAccountId", act);
    if (page) params.set("pageId", page);
    setAssetsLoading(true);
    setSaveDetail(null);
    try {
      const result = await fetchMetaAssetsJson(params.toString());
      if (!result.ok) {
        setPixels([]);
        setLeadForms([]);
        setPixelHint(
          `${result.detail} You can still paste Pixel ID ${pixelId || "28654551490903640"} below and click Save Pixel / Form.`,
        );
        setFormHint(null);
        return;
      }
      const d = result.data as {
        pixels?: AssetOption[];
        leadForms?: AssetOption[];
        pixelError?: string | null;
        leadFormError?: string | null;
      };
      const list = d.pixels ?? [];
      setPixels(list);
      setLeadForms(d.leadForms ?? []);
      setPixelHint(d.pixelError ?? null);
      setFormHint(d.leadFormError ?? null);

      const savedPixel = status?.connection?.pixelId?.trim() || "";
      const pick =
        savedPixel ||
        (list.some((p) => p.id === pixelId) ? pixelId : "") ||
        list[0]?.id ||
        "";
      if (pick) setPixelId(pick);

      // Connected + Pixel listed but not saved yet → persist so Marketing sees ORG_META_PIXEL
      if (
        step === "status" &&
        !savedPixel &&
        pick &&
        list.some((p) => p.id === pick)
      ) {
        const ok = await persistLeadAssets(pick, leadGenFormId || null);
        if (ok) {
          setSaveDetail(`Saved Pixel ${pick} for this organization.`);
        }
      }
    } catch (e) {
      setPixelHint(
        e instanceof Error ? e.message : "Failed to load Pixel / Instant Form lists",
      );
      setFormHint(null);
    } finally {
      setAssetsLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, [orgId]);

  useEffect(() => {
    if (step !== "pick" || !activeNonce) return;
    setLoading(true);
    void fetchMetaAssetsJson(`nonce=${encodeURIComponent(activeNonce)}`)
      .then((result) => {
        if (!result.ok) throw new Error(result.detail);
        const d = result.data as {
          adAccounts?: AssetOption[];
          pages?: AssetOption[];
        };
        const nextAccounts = d.adAccounts ?? [];
        const nextPages = d.pages ?? [];
        setAccounts(nextAccounts);
        setPages(nextPages);
        const act = nextAccounts[0]?.id ?? "";
        const page = nextPages[0]?.id ?? "";
        if (act) setAdAccountId(act);
        if (page) setPageId(page);
        if (act || page) void loadRelatedAssets(act, page);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load assets"))
      .finally(() => setLoading(false));
  }, [step, activeNonce, orgId]);

  useEffect(() => {
    if (step !== "pick") return;
    if (!adAccountId && !pageId) return;
    void loadRelatedAssets(adAccountId, pageId);
  }, [adAccountId, pageId, step]);

  // When already connected, seed account/page and load Pixel / Form lists
  useEffect(() => {
    if (step !== "status" || !status?.connection?.adAccountId) return;
    const act = status.connection.adAccountId;
    const page = status.connection.pageId ?? "";
    setAdAccountId(act);
    if (page) setPageId(page);
    void loadRelatedAssets(act, page);
  }, [step, status?.connection?.adAccountId, status?.connection?.pageId, orgId]);

  async function startOAuth() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/oauth/start`, {
      method: "POST",
    });
    const data = (await res.json()) as {
      url?: string | null;
      detail?: string;
      setupHints?: string[];
    };
    setLoading(false);
    if (!res.ok || !data.url) {
      setError(data.detail ?? "Cannot start Meta OAuth");
      return;
    }
    window.location.href = data.url;
  }

  async function completePick() {
    if (!activeNonce || !adAccountId || !pageId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/oauth/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nonce: activeNonce,
        adAccountId,
        pageId,
        pixelId: pixelId || null,
        leadGenFormId: leadGenFormId || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setStep("done");
    setActiveNonce(null);
    await refreshStatus();
    router.replace(`/app/orgs/${orgId}/settings/meta-connect?connected=1`);
  }

  async function saveLeadAssets() {
    setLoading(true);
    setError(null);
    setSaveDetail(null);
    const ok = await persistLeadAssets(pixelId || null, leadGenFormId || null);
    setLoading(false);
    if (ok) {
      setSaveDetail(
        pixelId
          ? `Saved Pixel ${pixelId}. Marketing → Launch with Meta can use website leads now.`
          : "Cleared Pixel / Form on this connection.",
      );
    }
  }

  async function disconnect() {
    setLoading(true);
    await fetch(`/api/v1/orgs/${orgId}/meta/oauth/disconnect`, { method: "POST" });
    setLoading(false);
    setStep("status");
    setPixelId("");
    setLeadGenFormId("");
    await refreshStatus();
  }

  const connected =
    status?.connection?.status === "connected" ||
    status?.connectionStatus === "connected";
  const expired = status?.connection?.status === "token_expired";
  const savedPixel = status?.connection?.pixelId?.trim() || "";
  const unsavedPixel =
    Boolean(pixelId) && pixelId !== savedPixel;
  const formHintIsEmptyOnly = Boolean(
    formHint && /no instant forms/i.test(formHint),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Connect Meta</h1>
          <p>
            Primary path: link this organization&apos;s Meta ad account and Page
            with Facebook Login for Business. Ads are created on{" "}
            <strong>their</strong> account. Platform App ID/Secret stay on
            Vercel; the user token is encrypted per org. Select a Pixel (website
            leads) and/or Instant Form for the promoted object.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/settings`}>
          <Button type="button" variant="ghost">
            Back to Settings
          </Button>
        </Link>
      </header>

      {connectedFlash || step === "done" ? (
        <p className="text-sm text-[var(--lo-success)]">
          Meta connected for this organization. Launch with Meta (AI) → Approve
          will use these credentials (PAUSED by default).
        </p>
      ) : null}
      {error ? <p className="lo-error">{error}</p> : null}

      {step === "pick" ? (
        <section className="lo-section lo-channel-card">
          <h2>Choose Ad Account, Page, and lead assets</h2>
          <p className="lo-muted text-sm">
            Only assets your Meta user and app can access are listed. Website
            lead ads need a Pixel; Instant Form ads need a Page lead form.
          </p>
          {loading && !accounts.length ? (
            <p className="lo-muted text-sm">Loading assets…</p>
          ) : (
            <form
              className="lo-advanced-form mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                void completePick();
              }}
            >
              <label className="lo-field">
                Ad account
                <select
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="lo-field">
                Page
                <select
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  required
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="lo-field">
                Meta Pixel (website leads)
                <select
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                >
                  <option value="">None — Instant Form only</option>
                  {pixels.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="lo-field">
                Instant Form (optional)
                <select
                  value={leadGenFormId}
                  onChange={(e) => setLeadGenFormId(e.target.value)}
                >
                  <option value="">None — website Pixel destination</option>
                  {leadForms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.status ? ` · ${f.status}` : ""} ({f.id})
                    </option>
                  ))}
                </select>
              </label>
              {assetsLoading ? (
                <p className="lo-muted text-xs">Loading Pixel / Form lists…</p>
              ) : null}
              {pixelHint ? (
                <p className="lo-error text-xs" role="status">
                  {pixelHint}
                </p>
              ) : null}
              {formHint ? (
                <p
                  className={
                    formHintIsEmptyOnly ? "lo-muted text-xs" : "lo-error text-xs"
                  }
                  role="status"
                >
                  {formHint}
                  {formHintIsEmptyOnly
                    ? " (OK for website Pixel leads — Instant Form is optional.)"
                    : ""}
                </p>
              ) : null}
              <label className="lo-field">
                Or paste Pixel ID
                <input
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value.trim())}
                  placeholder="e.g. 1121876317089963"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
              <Button
                type="submit"
                disabled={loading || !accounts.length || !pages.length}
              >
                Save connection
              </Button>
            </form>
          )}
        </section>
      ) : (
        <section className="lo-section lo-channel-card">
          <div className="lo-channel-card-head">
            <strong>Connection status</strong>
            <span className="lo-channel-status">
              <span
                className={`lo-status-dot ${connected && !expired ? "is-ok" : "is-warn"}`}
              />
              {expired
                ? "Token expired"
                : connected
                  ? "Connected"
                  : "Not connected"}
            </span>
          </div>
          {status ? (
            <>
              <p className="lo-muted text-sm">{status.detail}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{status.credentialStatus.replace(/_/g, " ")}</Badge>
                {status.source ? <Badge>source: {status.source}</Badge> : null}
              </div>
              {status.connection ? (
                <dl className="lo-meta-dl mt-3">
                  <div>
                    <dt>Ad account</dt>
                    <dd>
                      <code>{status.connection.adAccountId ?? "—"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Page</dt>
                    <dd>
                      <code>{status.connection.pageId ?? "—"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Pixel</dt>
                    <dd>
                      <code>{status.connection.pixelId ?? "—"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Instant Form</dt>
                    <dd>
                      <code>{status.connection.leadGenFormId ?? "—"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Connected</dt>
                    <dd>{status.connection.connectedAt ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Token expires</dt>
                    <dd>{status.connection.tokenExpiresAt ?? "unknown"}</dd>
                  </div>
                </dl>
              ) : null}
            </>
          ) : (
            <p className="lo-muted text-sm">Loading…</p>
          )}

          {connected && !expired ? (
            <form
              className="lo-advanced-form mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void saveLeadAssets();
              }}
            >
              <h3 className="text-sm font-medium">Lead destination assets</h3>
              <p className="lo-muted text-xs">
                Website OUTCOME_LEADS needs a saved Pixel (dropdown or paste ID,
                then Save). Instant Form is optional for website leads. Lists
                failing does not block Save.
              </p>
              {assetsLoading ? (
                <p className="lo-muted text-xs">Loading Pixel / Form lists from Meta…</p>
              ) : null}
              <label className="lo-field">
                Meta Pixel
                <select
                  value={
                    pixels.some((p) => p.id === pixelId) ? pixelId : pixelId ? "__custom__" : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__custom__") return;
                    setPixelId(v);
                  }}
                >
                  <option value="">None</option>
                  {pixels.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                  {pixelId && !pixels.some((p) => p.id === pixelId) ? (
                    <option value="__custom__">Saved: {pixelId}</option>
                  ) : null}
                </select>
              </label>
              <label className="lo-field">
                Or paste Pixel ID
                <input
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value.trim())}
                  placeholder="e.g. 1121876317089963"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
              <label className="lo-field">
                Instant Form
                <select
                  value={leadGenFormId}
                  onChange={(e) => setLeadGenFormId(e.target.value)}
                >
                  <option value="">None</option>
                  {leadForms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.id})
                    </option>
                  ))}
                </select>
              </label>
              {pixelHint ? (
                <p className="lo-error text-xs" role="status">
                  {pixelHint}
                </p>
              ) : null}
              {formHint ? (
                <p
                  className={
                    formHintIsEmptyOnly ? "lo-muted text-xs" : "lo-error text-xs"
                  }
                  role="status"
                >
                  {formHint}
                  {formHintIsEmptyOnly
                    ? " (OK for website Pixel leads — Instant Form is optional.)"
                    : ""}
                </p>
              ) : null}
              {unsavedPixel ? (
                <p className="lo-error text-xs" role="status">
                  Pixel selected but not saved yet — click Save Pixel / Form so
                  Marketing can publish.
                </p>
              ) : null}
              {saveDetail ? (
                <p className="text-xs text-[var(--lo-success)]" role="status">
                  {saveDetail}
                </p>
              ) : null}
              <div className="lo-launch-actions">
                <Button
                  type="submit"
                  disabled={loading || assetsLoading}
                  variant={unsavedPixel ? "primary" : "secondary"}
                >
                  {loading ? "Saving…" : "Save Pixel / Form"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={assetsLoading || !adAccountId}
                  onClick={() => void loadRelatedAssets(adAccountId, pageId)}
                >
                  {assetsLoading ? "Refreshing…" : "Refresh lists"}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="lo-launch-actions mt-4">
            <Button type="button" disabled={loading} onClick={startOAuth}>
              {connected || expired ? "Reconnect Meta" : "Connect Meta"}
            </Button>
            {connected || expired ? (
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={disconnect}
              >
                Disconnect
              </Button>
            ) : null}
            <Link href={`/app/orgs/${orgId}/marketing`}>
              <Button type="button" variant="ghost">
                Open Marketing
              </Button>
            </Link>
          </div>
        </section>
      )}

      <section className="lo-section">
        <h2>Do these in Meta (external)</h2>
        <p className="lo-muted text-sm">
          LeadOrbit does not automate billing, App Live, or Business creation.
        </p>
        <ul className="lo-muted mt-2 list-disc pl-5 text-sm">
          {(status?.externalChecklist ?? []).map((c) => (
            <li key={c.label}>
              <a href={c.href} target="_blank" rel="noopener noreferrer">
                {c.label}
              </a>
            </li>
          ))}
        </ul>
        {status?.oauthRedirectUri ? (
          <p className="lo-muted mt-3 text-xs">
            OAuth redirect URI (add in Meta App → Facebook Login → Settings):{" "}
            <code>{status.oauthRedirectUri}</code>
          </p>
        ) : null}
      </section>
    </div>
  );
}
