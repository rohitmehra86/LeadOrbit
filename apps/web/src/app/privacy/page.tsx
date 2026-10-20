import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
      <header className="lo-site-header">
        <Link href="/" className="lo-mark text-xl text-[var(--lo-fg)]">
          LeadOrbit
        </Link>
        <Link href="/login" className="text-sm text-[var(--lo-fg-muted)]">
          Sign in
        </Link>
      </header>
      <article className="flex-1 py-10">
        <h1 className="text-3xl">Privacy</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--lo-fg-muted)]">
          LeadOrbit stores account, organization, and CRM data you enter in the
          product. Workspace data is scoped by organization membership. Export
          and delete-request APIs are available to authorized org members where
          configured.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--lo-fg-muted)]">
          Third-party ad and messaging networks are only contacted when you
          configure credentials; we do not invent live connection states. For
          questions:{" "}
          <a
            className="text-[var(--lo-accent-soft)] underline"
            href="mailto:hello@leadorbit.dev"
          >
            hello@leadorbit.dev
          </a>
          .
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
