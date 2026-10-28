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
  const [relatedHint, setRelatedHint] = useState<string | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [activeNonce, setActiveNonce] = useState(nonce);

  async function refreshStatus() {
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/status`);
    if (!res.ok) return;
    const data = (await res.json()) as { item: StatusItem };
    setStatus(data.item);
    if (data.item.connection?.pixelId) setPixelId(data.item.connection.pixelId);
    if (data.item.connection?.leadGenFormId) {
      setLeadGenFormId(data.item.connection.leadGenFormId);
    }
  }

  async function loadRelatedAssets(act: string, page: string) {
    if (!act && !page) return;
    const params = new URLSearchParams();
    if (activeNonce) params.set("nonce", activeNonce);
    if (act) params.set("adAccountId", act);
    if (page) params.set("pageId", page);
    setAssetsLoading(true);
    try {
      const r = await fetch(`/api/v1/orgs/${orgId}/meta/oauth/assets?${params}`);
      if (!r.ok) {
        const body = await r.text();
        setPixels([]);
        setLeadForms([]);
        setRelatedHint(body || `Could not load Pixel/Form lists (HTTP ${r.status})`);
        return;
      }
      const d = (await r.json()) as {
        pixels?: AssetOption[];
        leadForms?: AssetOption[];
        pixelError?: string | null;
        leadFormError?: string | null;
      };
      setPixels(d.pixels ?? []);
      setLeadForms(d.leadForms ?? []);
      const hints = [d.pixelError, d.leadFormError].filter(Boolean);
      setRelatedHint(hints.length ? hints.join(" · ") : null);
      setPixelId((prev) => {
        if (prev) return prev;
        return d.pixels?.[0]?.id ?? "";
      });
    } catch (e) {
      setRelatedHint(
        e instanceof Error ? e.message : "Failed to load Pixel / Instant Form lists",
      );
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
    void fetch(
      `/api/v1/orgs/${orgId}/meta/oauth/assets?nonce=${encodeURIComponent(activeNonce)}`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<{
          adAccounts: AssetOption[];
          pages: AssetOption[];
        }>;
      })
      .then((d) => {
        setAccounts(d.adAccounts);
        setPages(d.pages);
        const act = d.adAccounts[0]?.id ?? "";
        const page = d.pages[0]?.id ?? "";
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
    const res = await fetch(`/api/v1/orgs/${orgId}/meta/connection`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pixelId: pixelId || null,
        leadGenFormId: leadGenFormId || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await refreshStatus();
  }

  async function disconnect() {
    setLoading(true);
