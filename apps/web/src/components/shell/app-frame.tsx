"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShellChrome } from "./shell-chrome";

/** Workspace-level chrome; skipped inside org shell (org layout owns top bar). */
export function AppFrame({
  email,
  isPlatformAdmin,
  children,
}: {
  email: string;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const inOrgShell = /\/app\/orgs\/[^/]+/.test(pathname);

  if (inOrgShell) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <ShellChrome email={email} />
      <div className="border-b border-[var(--lo-border)] bg-[var(--lo-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/app"
              className="lo-mark text-lg tracking-tight text-[var(--lo-fg)]"
            >
              LeadOrbit
            </Link>
            <nav className="flex flex-wrap gap-3 text-sm text-[var(--lo-fg-muted)]">
              <Link href="/app" className="hover:text-[var(--lo-fg)]">
                Workspaces
              </Link>
              <Link href="/app/accept-invite" className="hover:text-[var(--lo-fg)]">
                Accept invite
              </Link>
              {isPlatformAdmin ? (
                <Link href="/platform" className="hover:text-[var(--lo-fg)]">
                  Platform admin
                </Link>
              ) : null}
            </nav>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full">{children}</div>
    </div>
  );
}
