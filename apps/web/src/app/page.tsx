import Link from "next/link";
import { Badge, Button } from "@leadorbit/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="text-lg font-semibold tracking-tight">LeadOrbit</div>
        <Badge>Milestone 1 · Foundation</Badge>
      </header>

      <section className="lo-rise mt-24 flex flex-1 flex-col justify-center gap-6 pb-24">
        <p className="lo-pulse-soft text-sm font-medium uppercase tracking-[0.2em] text-[var(--lo-accent)]">
          AI Lead & Revenue Cloud
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          LeadOrbit
        </h1>
        <p className="lo-rise-delay max-w-2xl text-lg text-[var(--lo-fg-muted)] md:text-xl">
          Capture, qualify, converse, and convert — multi-tenant revenue ops with
          durable AI workers, Supabase RLS, and contract-first APIs ready for
          scale.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/api/v1/health">
            <Button type="button">Health check</Button>
          </Link>
          <Button type="button" variant="secondary" disabled>
            App login (Milestone 2)
          </Button>
        </div>

        <p className="text-sm text-[var(--lo-fg-muted)]">
          Auth, CRM, and integrations are not live yet. See{" "}
          <code className="rounded bg-[var(--lo-surface-elevated)] px-1.5 py-0.5 text-xs">
            IMPLEMENTATION_STATUS.md
          </code>
          .
        </p>
      </section>
    </main>
  );
}
