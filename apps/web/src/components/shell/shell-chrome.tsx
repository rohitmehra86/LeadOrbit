"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";

const SEGMENT_LABELS: Record<string, string> = {
  app: "Workspaces",
  orgs: "Org",
  assistant: "AI Assistant",
  leads: "Leads",
  marketing: "Marketing",
  sales: "Sales",
  results: "Results",
  settings: "Settings",
  crm: "CRM",
  inbox: "Inbox",
  integrations: "Integrations",
  "real-estate": "Real estate",
  workflows: "Workflows",
  billing: "Billing",
  analytics: "Analytics",
  calendar: "Calendar",
  marketplace: "Marketplace",
  developers: "Developers",
  ai: "AI lab",
  "white-label": "White label",
  "accept-invite": "Accept invite",
};

function labelFor(segment: string, orgName?: string): string {
  if (orgName && segment.length > 20) return orgName;
  return SEGMENT_LABELS[segment] ?? segment;
}

export function ShellChrome({
  email,
  orgName,
  orgId,
}: {
  email: string;
  orgName?: string;
  orgId?: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setNotifyOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string; current?: boolean }[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    acc += `/${seg}`;
    const isOrgId = parts[i - 1] === "orgs" && orgName;
    const label = isOrgId ? orgName : labelFor(seg, orgName);
    if (seg === "orgs") continue;
    crumbs.push({
      href: acc,
      label,
      current: i === parts.length - 1,
    });
  }

  return (
    <header className="lo-shell-top" ref={menuRef}>
      <nav className="lo-breadcrumbs" aria-label="Breadcrumb">
        {crumbs.length === 0 ? (
          <strong>LeadOrbit</strong>
        ) : (
          crumbs.map((c, idx) => (
            <span key={c.href} className="inline-flex items-center gap-1">
              {idx > 0 ? <span aria-hidden>/</span> : null}
              {c.current ? (
                <strong>{c.label}</strong>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
            </span>
          ))
        )}
      </nav>
      <div className="lo-top-actions">
        <button
          type="button"
          className="lo-notify-btn"
          aria-expanded={notifyOpen}
          onClick={() => {
            setNotifyOpen((v) => !v);
            setMenuOpen(false);
          }}
        >
          Notifications
        </button>
        <button
          type="button"
          className="lo-user-menu-btn"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((v) => !v);
            setNotifyOpen(false);
          }}
        >
          {email}
        </button>
        {notifyOpen ? (
          <div className="lo-user-menu" role="dialog" aria-label="Notifications">
            <p className="px-2 py-2 text-xs text-[var(--lo-fg-muted)]">
              No unread notifications. Delivery channels remain off until
              email/SMS/WhatsApp credentials are configured.
            </p>
          </div>
        ) : null}
        {menuOpen ? (
          <div className="lo-user-menu" role="menu">
            <p className="px-2 py-1 text-xs text-[var(--lo-fg-muted)]">{email}</p>
            <Link href="/app" role="menuitem" onClick={() => setMenuOpen(false)}>
              All workspaces
            </Link>
            {orgId ? (
              <Link
                href={`/app/orgs/${orgId}/settings`}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Workspace settings
              </Link>
            ) : null}
            <form action={signOutAction}>
              <button type="submit" role="menuitem">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
