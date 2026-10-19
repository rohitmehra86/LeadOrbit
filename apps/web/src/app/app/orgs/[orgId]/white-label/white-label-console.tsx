"use client";

import { useState } from "react";
import type {
  AgencyManagedOrg,
  CustomDomain,
  WhiteLabelBrand,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  brand: WhiteLabelBrand;
  domains: CustomDomain[];
  visibility: { features: string[]; all: Record<string, boolean> };
  agencyChildren: AgencyManagedOrg[];
  canEdit: boolean;
};

export function WhiteLabelConsole(props: Props) {
  const [brand, setBrand] = useState(props.brand);
  const [domains, setDomains] = useState(props.domains);
  const [children, setChildren] = useState(props.agencyChildren);
  const [message, setMessage] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");
  const [childOrgId, setChildOrgId] = useState("");
  const [form, setForm] = useState({
    logoUrl: brand.logoUrl ?? "",
    primaryColor: brand.primaryColor ?? "#0B3D2E",
    accentColor: brand.accentColor ?? "#C4A35A",
    supportEmail: brand.supportEmail ?? "",
    loginHeadline: brand.loginHeadline ?? "",
    emailFromName: brand.emailFromName ?? "",
    emailFooter: brand.emailFooter ?? "",
    hideLeadOrbitBranding: brand.hideLeadOrbitBranding,
  });

  async function saveBrand() {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/white-label`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update_brand",
        brand: {
          logoUrl: form.logoUrl || null,
          primaryColor: form.primaryColor || null,
          accentColor: form.accentColor || null,
          supportEmail: form.supportEmail || null,
          loginHeadline: form.loginHeadline || null,
          emailFromName: form.emailFromName || null,
          emailFooter: form.emailFooter || null,
          hideLeadOrbitBranding: form.hideLeadOrbitBranding,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? data.title ?? "Save failed");
      return;
    }
    setBrand(data.brand);
    setMessage("Brand saved");
  }

  async function addDomain() {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/white-label`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add_domain", hostname }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Domain add failed");
      return;
    }
    setDomains((d) => [data.domain, ...d]);
    setHostname("");
    setMessage("Domain verification scaffolded");
  }

  async function linkChild() {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/white-label`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "link_agency",
        childOrgId,
        label: "Managed client",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Link failed");
      return;
    }
    setChildren((c) => [data.link, ...c]);
    setChildOrgId("");
    setMessage("Agency child linked");
  }

  const previewStyle = {
    background: `linear-gradient(145deg, ${form.primaryColor || "#0B3D2E"}, #061a14)`,
    color: "#f5f0e6",
  } as const;

  return (
    <div className="flex flex-col gap-8">
      {message ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-medium">Brand</h2>
          <div className="space-y-3 text-sm">
            {(
              [
                ["logoUrl", "Logo URL"],
                ["primaryColor", "Primary color"],
                ["accentColor", "Accent color"],
                ["supportEmail", "Support email"],
                ["loginHeadline", "Login headline"],
                ["emailFromName", "Email from name"],
                ["emailFooter", "Email footer"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[var(--lo-fg-muted)]">{label}</span>
                <input
                  className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2"
                  value={form[key]}
                  disabled={!props.canEdit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.hideLeadOrbitBranding}
                disabled={!props.canEdit}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    hideLeadOrbitBranding: e.target.checked,
                  }))
                }
              />
              Hide LeadOrbit branding
            </label>
            {props.canEdit ? (
              <Button type="button" onClick={() => void saveBrand()}>
                Save brand
              </Button>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-medium">Branded login preview</h2>
          <div
            className="flex min-h-[220px] flex-col justify-end rounded-md p-6"
            style={previewStyle}
          >
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logoUrl}
                alt="Brand logo"
                className="mb-4 h-10 w-auto object-contain"
              />
            ) : (
              <p className="mb-2 text-2xl font-semibold tracking-tight">
                {form.emailFromName || "Your brand"}
              </p>
            )}
            <p className="text-xl font-medium">
              {form.loginHeadline || "Sign in to continue"}
            </p>
            <p className="mt-2 text-sm opacity-80">
              {form.hideLeadOrbitBranding
                ? "LeadOrbit mark hidden"
                : "Powered by LeadOrbit"}
            </p>
          </div>
          <p className="mt-2 text-xs text-[var(--lo-fg-muted)]">
            Public API:{" "}
            <code>/api/v1/public/branding/{props.orgId}</code>
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Feature visibility</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {Object.entries(props.visibility.all).map(([k, v]) => (
            <li key={k}>
              <Badge>
                {k}: {v ? "visible" : "hidden"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Custom domains</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className="min-w-[240px] flex-1 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2 text-sm"
            placeholder="crm.client.example.com"
            value={hostname}
            disabled={!props.canEdit}
            onChange={(e) => setHostname(e.target.value)}
          />
          {props.canEdit ? (
            <Button type="button" onClick={() => void addDomain()}>
              Add domain
            </Button>
          ) : null}
        </div>
        {domains.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">No domains yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {domains.map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono">{d.hostname}</span>
                  <Badge>{d.status}</Badge>
                </div>
                {d.txtChallenge ? (
                  <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">
                    TXT: {d.txtChallenge}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">{d.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Agency management</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className="min-w-[240px] flex-1 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2 text-sm font-mono"
            placeholder="Child org UUID"
            value={childOrgId}
            disabled={!props.canEdit}
            onChange={(e) => setChildOrgId(e.target.value)}
          />
          {props.canEdit ? (
            <Button type="button" onClick={() => void linkChild()}>
              Link child org
            </Button>
          ) : null}
        </div>
        {children.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">
            No managed orgs — scaffolding for agency hierarchies.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {children.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2 font-mono text-xs"
              >
                {c.label ?? "child"} · {c.childOrgId}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
