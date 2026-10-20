import Link from "next/link";
import { Badge, Button } from "@leadorbit/ui";
import { authStatus } from "@/lib/auth/session";

export default function HomePage() {
  const status = authStatus();

  return (
    <main className="lo-hero-landing mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="relative z-10 flex items-center justify-between gap-4">
        <div className="lo-mark text-2xl font-semibold tracking-tight text-[var(--lo-accent-soft)]">
          LeadOrbit
        </div>
        <Badge>AI-first revenue cloud</Badge>
      </header>

      <section className="lo-rise relative z-10 mt-20 flex flex-1 flex-col justify-center gap-6 pb-24">
        <p className="lo-pulse-soft text-sm font-medium uppercase tracking-[0.22em] text-[var(--lo-accent)]">
          Marketing · Sales · Revenue
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          LeadOrbit
        </h1>
        <p className="lo-rise-delay max-w-xl text-lg text-[var(--lo-fg-muted)] md:text-xl">
          Tell the Assistant your goal. It launches capture, qualifies leads, and shows Results —
          without a consultant-shaped UI.
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
        </div>
        <p className="text-sm text-[var(--lo-fg-muted)]">
          Auth mode: <code>{status.authMode}</code>
          {" · "}
          Supabase: <code>{String(status.supabaseConfigured)}</code>
        </p>
      </section>
    </main>
  );
}
