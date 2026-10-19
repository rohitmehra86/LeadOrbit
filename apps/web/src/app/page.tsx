import Link from "next/link";
import { Badge, Button } from "@leadorbit/ui";
import { authStatus } from "@/lib/auth/session";

export default function HomePage() {
  const status = authStatus();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="text-lg font-semibold tracking-tight">LeadOrbit</div>
        <Badge>Milestone 2 · Auth & tenancy</Badge>
      </header>

      <section className="lo-rise mt-24 flex flex-1 flex-col justify-center gap-6 pb-24">
        <p className="lo-pulse-soft text-sm font-medium uppercase tracking-[0.2em] text-[var(--lo-accent)]">
          AI Lead & Revenue Cloud
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          LeadOrbit
        </h1>
        <p className="lo-rise-delay max-w-2xl text-lg text-[var(--lo-fg-muted)] md:text-xl">
          Multi-tenant auth, organizations, roles, invites, and SaaS admin — with RLS
          migrations ready for Supabase.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/signup">
            <Button type="button">Get started</Button>
          </Link>
          <Link href="/login">
            <Button type="button" variant="secondary">
              Sign in
            </Button>
          </Link>
          <Link href="/api/v1/health">
            <Button type="button" variant="ghost">
              Health
            </Button>
          </Link>
        </div>
        <p className="text-sm text-[var(--lo-fg-muted)]">
          Auth mode: <code>{status.authMode}</code>
          {" · "}
          Supabase configured: <code>{String(status.supabaseConfigured)}</code>
          {" · "}
          See <code>IMPLEMENTATION_STATUS.md</code> for blockers.
        </p>
      </section>
    </main>
  );
}
