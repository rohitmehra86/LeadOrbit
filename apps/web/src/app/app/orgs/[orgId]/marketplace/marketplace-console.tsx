"use client";

import { useState } from "react";
import type { MarketplacePack } from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Install = {
  id: string;
  packId: string;
  packSlug: string;
  campaignId: string | null;
  pageSlug: string | null;
  detail: string;
  createdAt: string;
};

export function MarketplaceConsole(props: {
  orgId: string;
  catalog: MarketplacePack[];
  installs: Install[];
}) {
  const [installs, setInstalls] = useState(props.installs);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function install(packId: string, publish: boolean) {
    setBusy(packId);
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/marketplace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "install", packId, publish }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMessage(data.detail ?? data.error ?? "Install failed");
      return;
    }
    setInstalls((prev) => [data.install, ...prev]);
    setMessage(
      `${data.pack.name}: ${data.install.detail}${
        data.launchPack?.publicPath ? ` → ${data.launchPack.publicPath}` : ""
      }`,
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {message ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2">
        {props.catalog.map((pack) => (
          <article
            key={pack.id}
            className="flex flex-col gap-3 rounded-md border border-[var(--lo-border)] px-4 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-medium">{pack.name}</h2>
              <Badge>{pack.status}</Badge>
            </div>
            <p className="text-sm text-[var(--lo-fg-muted)]">{pack.summary}</p>
            <p className="text-xs text-[var(--lo-fg-muted)]">
              Goal: {pack.defaultGoal}
              {pack.defaultLocation ? ` · ${pack.defaultLocation}` : ""}
            </p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy === pack.id}
                onClick={() => void install(pack.id, false)}
              >
                {busy === pack.id ? "Installing…" : "Install draft"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy === pack.id}
                onClick={() => void install(pack.id, true)}
              >
                Install + publish
              </Button>
            </div>
          </article>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Install history</h2>
        {installs.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">No installs yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
            {installs.map((i) => (
              <li key={i.id} className="px-3 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{i.packSlug}</span>
                  <span className="text-xs text-[var(--lo-fg-muted)]">
                    {i.createdAt}
                  </span>
                </div>
                <p className="mt-1 text-[var(--lo-fg-muted)]">{i.detail}</p>
                {i.pageSlug ? (
                  <a
                    className="mt-1 inline-block text-xs text-[var(--lo-accent)] underline"
                    href={`/p/${props.orgId}/${i.pageSlug}`}
                  >
                    Open public page
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
