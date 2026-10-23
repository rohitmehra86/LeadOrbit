"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdIntegration } from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type MetaStatus = {
  credentialStatus: string;
  detail: string;
  present: Record<string, boolean>;
  setupHints: string[];
  source?: string;
  connectionStatus?: string;
  connection?: {
    status: string;
    adAccountId: string | null;
    pageId: string | null;
  } | null;
  oauthRedirectUri?: string;
  integration: {
    status: string;
    lastError: string | null;
    externalAccountId?: string | null;
  } | null;
};

type Props = {
  orgId: string;
  integration?: AdIntegration;
  onRegisterInterest: () => void;
};

/** Advanced-only Connect Meta — OAuth per org; env fallback for demo. */
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
  const connected =
    status?.connectionStatus === "connected" ||
    status?.connection?.status === "connected" ||
    cred === "ready";
  const expired = status?.connection?.status === "token_expired";
  const integStatus =
    integration?.status ?? status?.integration?.status ?? "not_connected";

  return (
    <div className="lo-channel-card lo-connect-meta">
      <div className="lo-channel-card-head">
        <strong>Connect Meta</strong>
        <span className="lo-channel-status">
          <span
            className={`lo-status-dot ${connected && !expired ? "is-ok" : "is-warn"}`}
            aria-hidden
          />
          {expired
            ? "Token expired — reconnect"
            : connected
              ? "Connected"
              : "Pending configuration"}
        </span>
      </div>
      <p className="lo-muted text-xs">
        Customers connect their own Meta Business via OAuth (token encrypted per
        org). Platform keeps only App ID/Secret on Vercel. Global env token still
        works as a demo fallback.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge>{cred.replace(/_/g, " ")}</Badge>
        <Badge>{integStatus.replace(/_/g, " ")}</Badge>
        {status?.source ? <Badge>source: {status.source}</Badge> : null}
      </div>
      {status?.connection?.adAccountId ? (
        <p className="lo-muted mt-2 text-xs">
          Ad account <code>{status.connection.adAccountId}</code>
          {status.connection.pageId ? (
            <>
              {" "}
              · Page <code>{status.connection.pageId}</code>
            </>
          ) : null}
        </p>
      ) : null}
      {status?.detail ? (
        <p className="lo-muted mt-2 text-xs">{status.detail}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/app/orgs/${orgId}/settings/meta-connect`}>
          <Button type="button">
            {connected || expired ? "Manage Meta connection" : "Connect Meta"}
          </Button>
        </Link>
        {!connected ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onRegisterInterest}
          >
            Register connect intent
          </Button>
        ) : null}
      </div>
      <p className="lo-muted mt-3 text-xs">
        External in Meta (not automated here): Privacy Policy URL, App Live,
        Ad Account billing.
      </p>
      {integration?.lastError || status?.integration?.lastError ? (
        <p className="lo-muted mt-2 text-xs">
          {integration?.lastError ?? status?.integration?.lastError}
        </p>
      ) : null}
    </div>
  );
}
