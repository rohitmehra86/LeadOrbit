"use client";

import { useEffect, useState } from "react";
import type { AdIntegration } from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type MetaStatus = {
  credentialStatus: string;
  detail: string;
  present: Record<string, boolean>;
  setupHints: string[];
  integration: {
    status: string;
    lastError: string | null;
    externalAccountId?: string | null;
  } | null;
};

const ENV_FIELDS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "META_ADS_APP_ID", label: "App ID", required: true },
  { key: "META_ADS_APP_SECRET", label: "App Secret", required: true },
  {
    key: "META_ADS_ACCESS_TOKEN",
    label: "Access token (or complete OAuth)",
    required: true,
  },
  { key: "META_ADS_AD_ACCOUNT_ID", label: "Ad account ID (act_…)", required: true },
  { key: "META_ADS_PAGE_ID", label: "Page ID", required: true },
];

type Props = {
  orgId: string;
  integration?: AdIntegration;
  onRegisterInterest: () => void;
};

/** Advanced-only Connect Meta setup — never on Simple first paint. */
export function ConnectMetaPanel({
  orgId,
  integration,
  onRegisterInterest,
}: Props) {
  const [status, setStatus] = useState<MetaStatus | null>(null);

  useEffect(() => {
    void fetch(`/api/v1/orgs/${orgId}/meta/status`)
      .then((r) => r.json())
      .then((d: { item: MetaStatus }) => setStatus(d.item))
      .catch(() => setStatus(null));
  }, [orgId]);

  const cred =
    status?.credentialStatus ??
    (status as MetaStatus & { status?: string } | null)?.status ??
    "pending_configuration";
  const connected = cred === "ready";
  const integStatus = integration?.status ?? status?.integration?.status ?? "not_connected";

  return (
    <div className="lo-channel-card lo-connect-meta">
      <div className="lo-channel-card-head">
        <strong>Connect Meta</strong>
        <span className="lo-channel-status">
          <span
            className={`lo-status-dot ${connected ? "is-ok" : "is-warn"}`}
            aria-hidden
          />
          {connected ? "Credentials present" : "Pending configuration"}
        </span>
      </div>
      <p className="lo-muted text-xs">
        Set Production env on Vercel (names only below — never paste secrets
        into this UI). Status is honest: no “connected” without tokens.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge>{cred.replace(/_/g, " ")}</Badge>
        <Badge>{integStatus.replace(/_/g, " ")}</Badge>
      </div>
      <ul className="lo-meta-env-list">
        {ENV_FIELDS.map((f) => {
          const ok = Boolean(status?.present?.[f.key]);
          return (
            <li key={f.key}>
              <span
                className={`lo-status-dot ${ok ? "is-ok" : "is-warn"}`}
                aria-hidden
              />
              <code>{f.key}</code>
              <span className="lo-muted text-xs">
                {f.label}
                {f.required ? " · required" : ""}
              </span>
              <span className="text-xs">{ok ? "set" : "missing"}</span>
            </li>
          );
        })}
      </ul>
      <p className="lo-muted mt-2 text-xs">
        Optional later: OAuth redirect URI on the Meta App pointing at your
        LeadOrbit domain. Until then use a long-lived System User token.
      </p>
      {status?.detail ? (
        <p className="lo-muted mt-2 text-xs">{status.detail}</p>
      ) : null}
      {!connected ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={onRegisterInterest}
        >
          Register connect intent
        </Button>
      ) : null}
      {integration?.lastError || status?.integration?.lastError ? (
        <p className="lo-muted mt-2 text-xs">
          {integration?.lastError ?? status?.integration?.lastError}
        </p>
      ) : null}
    </div>
  );
}
