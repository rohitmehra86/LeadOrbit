import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@leadorbit/ui";
import { signOutAction } from "@/app/actions/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--lo-border)] bg-[var(--lo-surface)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/app" className="lo-mark text-lg font-semibold tracking-tight text-[var(--lo-accent-soft)]">
              LeadOrbit
            </Link>
            <nav className="flex flex-wrap gap-3 text-sm text-[var(--lo-fg-muted)]">
              <Link href="/app">Workspaces</Link>
              <Link href="/app/accept-invite">Accept invite</Link>
              {user.isPlatformAdmin ? (
                <Link href="/platform">Platform admin</Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Badge>{user.email}</Badge>
            <form action={signOutAction}>
              <button type="submit" className="text-[var(--lo-fg-muted)] underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full">{children}</div>
    </div>
  );
}
