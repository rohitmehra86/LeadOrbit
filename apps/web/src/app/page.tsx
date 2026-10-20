import Link from "next/link";
import { Button } from "@leadorbit/ui";
import { SiteFooter } from "@/components/site/site-footer";

const CAPABILITIES = [
  {
    title: "AI Assistant launch",
    body: "Describe a goal; LeadOrbit drafts capture pages, forms, and follow-up paths you can approve.",
  },
  {
    title: "Lead inbox & CRM",
    body: "Ownership, scoring, and next actions in one workspace — not a disconnected demo board.",
  },
  {
    title: "Campaigns & attribution",
    body: "UTM-aware campaigns, funnels, and results that distinguish zero from unavailable data.",
  },
  {
    title: "Integrations with honest status",
    body: "Meta, Google, WhatsApp, and calendars stay pending until credentials exist — never fake-success.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="lo-hero-landing mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
      <header className="lo-site-header relative z-10">
        <div className="lo-mark text-2xl text-[var(--lo-fg)]">LeadOrbit</div>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-[var(--lo-fg-muted)]">
          <a href="#capabilities" className="hover:text-[var(--lo-fg)]">
            Capabilities
          </a>
          <Link href="/login" className="hover:text-[var(--lo-fg)]">
            Sign in
          </Link>
          <Link href="/signup">
            <Button type="button">Start free</Button>
          </Link>
        </nav>
      </header>

      <section className="lo-rise relative z-10 mt-16 flex flex-1 flex-col justify-center gap-5 pb-16 md:mt-24">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--lo-accent-soft)]">
          AI lead & revenue cloud
        </p>
        <h1 className="max-w-3xl text-5xl leading-[1.05] tracking-tight md:text-6xl">
          LeadOrbit
        </h1>
        <p className="lo-rise-delay max-w-xl text-base text-[var(--lo-fg-muted)] md:text-lg">
          Capture, qualify, and convert with an AI-first workspace built for
          agencies and growth teams — GHL- and HubSpot-class workflows without
          the consultant maze.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="/signup">
            <Button type="button">Create workspace</Button>
          </Link>
          <Link href="/login">
            <Button type="button" variant="secondary">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section
        id="capabilities"
        className="relative z-10 border-t border-[var(--lo-border)] py-14"
      >
        <h2 className="text-xl">What teams run in LeadOrbit</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
          Working product slices — not mock screens. Ad networks and messaging
          stay blocked until you supply credentials.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {CAPABILITIES.map((item) => (
            <div key={item.title}>
              <h3 className="font-sans text-sm font-semibold tracking-tight text-[var(--lo-fg)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
