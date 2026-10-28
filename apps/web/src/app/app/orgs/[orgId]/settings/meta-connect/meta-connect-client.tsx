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
      setError(await res.text());
      return false;
    }
    await refreshStatus();
    return true;
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
      const r = await fetch(`/api/v1/orgs/${orgId}/meta/oauth/assets?${params}`);
      if (!r.ok) {
        const body = await r.text();
        setPixels([]);
        setLeadForms([]);
        setPixelHint(body || `Could not load Pixel/Form lists (HTTP ${r.status})`);
        setFormHint(null);
        return;
      }
      const d = (await r.json()) as {
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

  return (
    <div className="flex flex-col gap-6">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Connect Meta</h1>
          <p>Primary path: link this organization&apos;s Meta ad account and Page.</p>
        </div>
        <Link href={`/app/orgs/${orgId}/settings`}>
          <Button type="button" variant="ghost">Back to Settings</Button>
        </Link>
      </header>
      {error ? <p className="lo-error">{error}</p> : null}
      <section className="lo-section lo-channel-card">
        <div className="lo-launch-actions mt-4">
          <Button type="button" disabled={loading} onClick={startOAuth}>
            Connect Meta
          </Button>
        </div>
      </section>
    </div>
  );
}
