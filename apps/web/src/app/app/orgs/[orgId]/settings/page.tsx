import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getIngestionStore } from "@/lib/tenancy/ingestion";
import { AuthError } from "@leadorbit/db";
import { Badge, Button } from "@leadorbit/ui";
import { SettingsForm } from "../settings-form";
import { InviteForm } from "../invite-form";

type Props = { params: Promise<{ orgId: string }> };

function statusDot(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("active") || s.includes("connected") || s === "ok") {
    return "is-ok";
  }
  if (
    s.includes("pending") ||
    s.includes("config") ||
    s.includes("unauthorized")
  ) {
    return "is-warn";
  }
  return "is-off";
}

export default async function SettingsPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const store = getTenancyStore();
  let org;
  try {
    org = await store.getOrganization(user, orgId);
  } catch (e) {
    if (e instanceof AuthError && e.code === "not_found") notFound();
    throw e;
  }

  const membership = await store.getMembership(user.id, orgId);
  const members = await store.listMembers(user, orgId);
  const flags = await store.listFlags(user, orgId);
  const entitlement = await store.getEntitlements(user, orgId);
  const quotas = await store.listQuotas(user, orgId);

  let adIntegrations: Awaited<
    ReturnType<ReturnType<typeof getCampaignStore>["listAdIntegrations"]>
  > = [];
  try {
    adIntegrations = await getCampaignStore().listAdIntegrations(user, orgId);
  } catch {
    adIntegrations = [];
  }

  let channels: Awaited<
    ReturnType<ReturnType<typeof getIngestionStore>["listChannelAdapters"]>
  > = [];
  try {
    channels = await getIngestionStore().listChannelAdapters(user, orgId);
  } catch {
    channels = [];
  }

  const knownNetworks = [
    { key: "meta", label: "Meta Ads" },
    { key: "google_ads", label: "Google Ads" },
    { key: "meta_lead_ads", label: "Meta Lead Ads" },
    { key: "google_lead_ads", label: "Google Lead Ads" },
    { key: "whatsapp", label: "WhatsApp" },
  ] as const;

  const integrationRows = knownNetworks.map((n) => {
    const ad = adIntegrations.find(
      (i) => i.network === n.key || String(i.network).includes(n.key),
    );
    const ch = channels.find(
      (c) => c.channel === n.key || String(c.channel).includes(n.key),
    );
    const status = ad?.status ?? ch?.status ?? "not_connected";
    const detail =
      ad?.lastError ??
      ch?.lastError ??
      (status === "not_connected" ? "No credentials configured" : null);
    return { ...n, status, detail };
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Settings</h1>
          <p>
            Branding, team, and integration status for {org.name}. Ad and
            messaging networks stay pending until credentials exist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {membership ? <Badge>{membership.role}</Badge> : null}
          <Link href={`/app/orgs/${orgId}/integrations`}>
            <Button type="button" variant="secondary">
              Integration detail
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="lo-section">
          <h2>Brand</h2>
          <p className="lo-muted mb-3 text-sm">
            Colors and support contact used on branded surfaces.
          </p>
          <SettingsForm org={org} />
        </div>
        <div className="lo-section">
          <h2>Invite teammate</h2>
          <p className="lo-muted mb-3 text-sm">
            Invite by email. Share the returned token via Accept invite.
          </p>
          <InviteForm orgId={org.id} />
        </div>
      </section>

      <section className="lo-section">
        <h2>Team</h2>
        <div className="lo-table-wrap mt-3">
          <table className="lo-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs">{m.userId}</td>
                  <td>{m.role}</td>
                  <td className="lo-muted">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lo-section">
        <h2>Integrations status</h2>
        <p className="lo-muted mb-3 text-sm">
          Honest status only — never shown as connected without credentials.
        </p>
        <div className="lo-table-wrap">
          <table className="lo-table">
            <thead>
              <tr>
                <th>Integration</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {integrationRows.map((row) => (
                <tr key={row.key}>
                  <td className="font-medium">{row.label}</td>
                  <td>
                    <span className={`lo-status-dot ${statusDot(row.status)}`} />
                    {row.status}
                  </td>
                  <td className="lo-muted text-xs">{row.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="lo-section">
          <h2>Feature flags</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {flags.length === 0 ? (
              <li className="lo-muted">No org flags recorded.</li>
            ) : (
              flags.map((f) => (
                <li
                  key={f.id}
                  className="flex justify-between rounded-[var(--radius)] border border-[var(--lo-border)] px-3 py-2"
                >
                  <span>{f.key}</span>
                  <span className="lo-muted">{f.enabled ? "on" : "off"}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="lo-section">
          <h2>Plan & quotas</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between border-b border-[var(--lo-border)] py-2">
              <dt className="lo-muted">Plan</dt>
              <dd>
                {entitlement?.planCode ?? "none"} ·{" "}
                {entitlement?.status ?? "n/a"}
              </dd>
            </div>
            {quotas.length === 0 ? (
              <p className="lo-muted text-sm">No quotas recorded for this org.</p>
            ) : (
              quotas.slice(0, 8).map((q) => (
                <div
                  key={q.id}
                  className="flex justify-between border-b border-[var(--lo-border)] py-2"
                >
                  <dt className="lo-muted">{q.metric}</dt>
                  <dd>
                    {q.usedValue}/{q.limitValue}
                  </dd>
                </div>
              ))
            )}
          </dl>
          <div className="lo-card-actions">
            <Link href={`/app/orgs/${orgId}/billing`}>
              <Button type="button" variant="secondary">
                Billing
              </Button>
            </Link>
            <Link href={`/app/orgs/${orgId}/white-label`}>
              <Button type="button" variant="ghost">
                White label
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
