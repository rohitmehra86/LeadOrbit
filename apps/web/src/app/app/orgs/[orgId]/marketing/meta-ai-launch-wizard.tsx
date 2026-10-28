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
  const [step, setStep] = useState<"brief" | "creative" | "review" | "done">("brief");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [destination, setDestination] = useState<DestinationMode>("website");
  const [businessOrOffer, setBusinessOrOffer] = useState("");
  const [geo, setGeo] = useState("");
  const [budgetAmount, setBudgetAmount] = useState(25);
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (!open) return;
    void fetch(`/api/v1/orgs/${orgId}/meta/status`)
      .then((r) => r.json())
      .then((d: { item: MetaStatus }) => setStatus(d.item))
      .catch(() => setStatus(null));
  }, [open, orgId]);

  const hasPixel =
    Boolean(status?.present?.ORG_META_PIXEL) ||
    Boolean(status?.connection?.pixelId) ||
    (Boolean(status?.present?.META_ADS_ALLOW_ENV_FALLBACK) &&
      Boolean(status?.present?.META_ADS_PIXEL_ID));

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
          <p className="lo-muted text-sm">Guided lead-gen setup.</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
      {destination === "website" && !hasPixel ? (
        <p className="lo-error text-sm">
          No Pixel saved on this org yet. Open{" "}
          <Link href={`/app/orgs/${orgId}/settings/meta-connect`}>Connect Meta</Link>
          , select the Pixel, click <strong>Save Pixel / Form</strong>, then come back.
        </p>
      ) : null}
      {error ? <p className="lo-error mt-3">{error}</p> : null}
    </div>
  );
}
