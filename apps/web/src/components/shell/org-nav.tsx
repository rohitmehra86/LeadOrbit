"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModeSwitcher, useUxMode } from "./ux-mode";

const PRIMARY = [
  { key: "home", label: "Home", href: (id: string) => `/app/orgs/${id}` },
  { key: "assistant", label: "AI Assistant", href: (id: string) => `/app/orgs/${id}/assistant` },
  { key: "leads", label: "Leads", href: (id: string) => `/app/orgs/${id}/leads` },
  { key: "marketing", label: "Marketing", href: (id: string) => `/app/orgs/${id}/marketing` },
  { key: "sales", label: "Sales & Appointments", href: (id: string) => `/app/orgs/${id}/sales` },
  { key: "results", label: "Results", href: (id: string) => `/app/orgs/${id}/results` },
  { key: "settings", label: "Settings", href: (id: string) => `/app/orgs/${id}/settings` },
] as const;

const EXPERT_EXTRA = [
  // Real estate first so Advanced mode (slice 0..4) exposes it for broker demos.
  { label: "Real estate", href: (id: string) => `/app/orgs/${id}/real-estate` },
  { label: "CRM board", href: (id: string) => `/app/orgs/${id}/crm` },
  { label: "Workflows", href: (id: string) => `/app/orgs/${id}/workflows` },
  { label: "Inbox", href: (id: string) => `/app/orgs/${id}/inbox` },
  { label: "AI lab", href: (id: string) => `/app/orgs/${id}/ai` },
  { label: "Integrations", href: (id: string) => `/app/orgs/${id}/integrations` },
  { label: "Billing", href: (id: string) => `/app/orgs/${id}/billing` },
  { label: "White label", href: (id: string) => `/app/orgs/${id}/white-label` },
] as const;

export function OrgNav({
  orgId,
  orgName,
  email,
}: {
  orgId: string;
  orgName: string;
  email: string;
}) {
  const pathname = usePathname();
  const { mode } = useUxMode();

  return (
    <aside className="lo-shell-nav">
      <div className="lo-shell-brand">
        <Link href="/app" className="lo-mark">
          LeadOrbit
        </Link>
        <p className="lo-shell-org">{orgName}</p>
        <p className="lo-shell-user">{email}</p>
      </div>
      <nav aria-label="Primary">
        <ul>
          {PRIMARY.map((item) => {
            const href = item.href(orgId);
            const active =
              item.key === "home"
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={item.key}>
                <Link href={href} className={active ? "is-active" : undefined}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {mode !== "simple" ? (
        <div className="lo-shell-extra">
          <p className="lo-shell-extra-label">
            {mode === "expert" ? "Expert modules" : "Advanced"}
          </p>
          <ul>
            {(mode === "expert" ? EXPERT_EXTRA : EXPERT_EXTRA.slice(0, 4)).map((item) => (
              <li key={item.label}>
                <Link href={item.href(orgId)}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="lo-shell-footer">
        <ModeSwitcher />
        <Link href="/app" className="lo-shell-workspaces">
          All workspaces
        </Link>
      </div>
    </aside>
  );
}
