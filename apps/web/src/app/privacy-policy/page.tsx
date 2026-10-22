import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy — LeadOrbit",
  description:
    "How LeadOrbit collects, uses, stores, and shares information when you use our AI lead and revenue workspace.",
};

const CONTACT_EMAIL = "mehr.rohit86@gmail.com";
const EFFECTIVE = "22 October 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
      <header className="lo-site-header">
        <Link href="/" className="lo-mark text-xl text-[var(--lo-fg)]">
          LeadOrbit
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-[var(--lo-fg-muted)]">
          <Link href="/login" className="hover:text-[var(--lo-fg)]">
            Sign in
          </Link>
          <Link href="/signup" className="hover:text-[var(--lo-fg)]">
            Start free
          </Link>
        </nav>
      </header>

      <article className="lo-legal flex-1 py-10">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--lo-accent-soft)]">
          Legal
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-[var(--lo-fg-muted)]">
          Effective date: {EFFECTIVE}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-[var(--lo-fg-muted)]">
          This Privacy Policy describes how <strong>LeadOrbit</strong> (“we”,
          “us”) handles information when you visit{" "}
          <a href="https://leadorbit-delta.vercel.app">
            leadorbit-delta.vercel.app
          </a>
          , create an account, use the LeadOrbit workspace, or submit
          information through public capture pages and forms we host. It is
          based on how the product is built today. It is not a certification of
          GDPR, DPDP, SOC 2, or any other compliance program.
        </p>

        <section>
          <h2>1. Information we collect</h2>
          <p>Depending on how you use LeadOrbit, we may process:</p>
          <ul>
            <li>
              <strong>Account information</strong> — such as name, email
              address, and authentication credentials (via our auth provider
              when configured, currently Supabase Auth in production, or a
              local session cookie in development).
            </li>
            <li>
              <strong>Organization and membership data</strong> — workspace
              name, roles, and which users belong to which organization.
            </li>
            <li>
              <strong>CRM and lead data</strong> — information you or your team
              enter, import, or receive about leads and contacts (for example
              name, email, phone, status, scores, notes, tasks, and related
              records), scoped to your organization.
            </li>
            <li>
              <strong>Marketing and campaign data</strong> — campaign settings,
              form definitions, landing page content, UTM/attribution fields,
              creatives metadata, and performance summaries generated in the
              product.
            </li>
            <li>
              <strong>Public form and page submissions</strong> — when someone
              fills a LeadOrbit-hosted capture form or landing page, we store
              the submitted fields and related attribution for the owning
              organization. Forms may include consent notice text you configure.
            </li>
            <li>
              <strong>Assistant and AI usage</strong> — messages and tool
              plans you send to the in-product AI Assistant, and operational
              metering of AI usage against your plan entitlements when
              billing features are enabled.
            </li>
            <li>
              <strong>Integrations configuration</strong> — connection status
              and identifiers for ad or messaging networks you choose to
              connect. Secret credentials (such as Meta access tokens) are
              intended to be stored as environment/configuration secrets on the
              hosting platform, not pasted into public UI fields.
            </li>
            <li>
              <strong>Technical and security data</strong> — such as IP address
              used for rate limiting, request paths, CSRF origin checks, and
              standard server/application logs needed to operate and protect the
              service.
            </li>
          </ul>
        </section>

        <section>
          <h2>2. Facebook and Instagram Lead Ads integration</h2>
          <p>
            LeadOrbit can integrate with Meta (Facebook / Instagram) advertising
            when an organization owner configures Marketing API credentials
            (application identifiers, access token, ad account, and Page). When
            that integration is enabled:
          </p>
          <ul>
            <li>
              You may use LeadOrbit’s guided “Launch with Meta (AI)” flow to
              prepare lead-generation campaign plans. Creating or changing ads
              on Meta requires your explicit approval in the product. Default
              create status is paused unless you opt in to enable spend.
            </li>
            <li>
              LeadOrbit may call Meta’s Marketing API to create or manage
              campaigns, ad sets, ads, and related objects, and may store Meta
              object identifiers (such as campaign, ad set, and ad IDs) against
              your workspace records.
            </li>
            <li>
              If you connect Meta lead-ad or form integrations, lead payload
              fields returned by Meta for your ad account/Page may be ingested
              into your organization’s CRM, subject to Meta’s policies and the
              permissions you grant.
            </li>
            <li>
              Without valid credentials, LeadOrbit does not claim that ads are
              live; incomplete configuration remains in a pending state.
            </li>
          </ul>
          <p>
            Meta’s own collection and use of data (including through Facebook,
            Instagram, and Ads Manager) is governed by Meta’s terms and privacy
            policies. We do not control Meta’s platforms.
          </p>
        </section>

        <section>
          <h2>3. How information is used</h2>
          <p>We use information to:</p>
          <ul>
            <li>Provide, operate, and secure the LeadOrbit service</li>
            <li>
              Authenticate users and enforce organization membership and
              permissions
            </li>
            <li>
              Run CRM, marketing, assistant, calendar, and related workspace
              features you enable
            </li>
            <li>
              Publish capture pages/forms you approve and attribute inbound leads
            </li>
            <li>
              Call third-party APIs you configure (for example Meta Marketing
              API) after required approvals
            </li>
            <li>
              Monitor abuse (rate limits), diagnose errors, and improve
              reliability
            </li>
            <li>Respond to support and privacy requests you send us</li>
          </ul>
          <p>
            We do not sell personal information as a business model. We do not
            use public marketing trackers beyond what is described in Cookies
            and tracking below.
          </p>
        </section>

        <section>
          <h2>4. Data storage and security</h2>
          <p>
            Production LeadOrbit is hosted on <strong>Vercel</strong> (web
            application) and uses <strong>Supabase</strong> (PostgreSQL and Auth)
            for durable tenant data when authentication is configured for
            Supabase. Data is scoped by organization membership checks; Supabase
            deployments use row-level security migrations where applied.
          </p>
          <p>
            We apply industry-common controls available in this architecture —
            including HTTPS, security headers, CSRF origin checks for mutating
            API calls, session cookies configured for the auth mode in use, and
            rate limiting. No method of transmission or storage is completely
            secure; we work to reduce risk but cannot guarantee absolute
            security.
          </p>
        </section>

        <section>
          <h2>5. Data sharing and third-party services</h2>
          <p>
            We share information with service providers and platforms only as
            needed to run LeadOrbit or when you connect an integration:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — authentication and database hosting
            </li>
            <li>
              <strong>Vercel</strong> — application hosting and related
              infrastructure
            </li>
            <li>
              <strong>Meta Platforms</strong> — when you configure Meta Ads /
              Marketing API credentials and approve actions that call Meta
            </li>
            <li>
              <strong>Other optional integrations</strong> (for example Google
              Ads stubs, messaging, calendar, or payment providers) — only when
              you supply credentials or enable those features; the product is
              designed not to invent “connected” states without configuration
            </li>
          </ul>
          <p>
            We may also disclose information if required by law, to protect the
            rights and safety of LeadOrbit or others, or in connection with a
            business transfer, subject to applicable law.
          </p>
        </section>

        <section>
          <h2>6. Data retention</h2>
          <p>
            We retain account, organization, CRM, and campaign data for as long
            as your workspace remains active and as needed to provide the
            service, resolve disputes, enforce agreements, and meet legal
            obligations. Specific retention schedules for each data class may
            vary; if you need a formal retention schedule for your
            organization, contact us. When you request deletion, we process the
            request as described below.
          </p>
        </section>

        <section>
          <h2>7. User rights and data deletion requests</h2>
          <p>
            Depending on where you live and your relationship to a LeadOrbit
            workspace, you may have rights to access, correct, export, or
            request deletion of personal information.
          </p>
          <ul>
            <li>
              <strong>Workspace members</strong> — authorized organization
              members can manage leads and related records in-product. Export
              and deletion-request API scaffolds exist for organizations (
              <code>privacy/export</code> and <code>privacy/delete-request</code>
              ); automated purge may require operator follow-through.
            </li>
            <li>
              <strong>End users who submitted a public form</strong> — contact
              the business that published the form, or email us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with
              enough detail for us to locate the submission. We may need to
              verify the request and coordinate with the organization that owns
              the data.
            </li>
          </ul>
          <p>
            To exercise a privacy request, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the
            subject line “Privacy request”.
          </p>
        </section>

        <section>
          <h2>8. Cookies and tracking</h2>
          <p>
            LeadOrbit uses cookies and similar technologies that are required
            for the product to function:
          </p>
          <ul>
            <li>
              <strong>Authentication / session cookies</strong> — to keep you
              signed in (Supabase auth cookies in production, or a LeadOrbit
              session cookie in local development mode).
            </li>
            <li>
              <strong>UX preference cookie</strong> — for example{" "}
              <code>lo_ux_mode</code>, which remembers Simple / Advanced /
              Expert UI preference in the browser.
            </li>
          </ul>
          <p>
            We do not currently ship a third-party advertising pixel or consumer
            analytics SDK (such as Google Analytics) in the public marketing
            site based on the application code. Server-side rate limiting and
            logs may process IP addresses. Browser “Do Not Track” signals are
            not universally standardized; we limit tracking to operational needs
            described here.
          </p>
        </section>

        <section>
          <h2>9. Children&apos;s privacy</h2>
          <p>
            LeadOrbit is intended for business and professional use. It is not
            directed to children under 16 (or the minimum age required in your
            jurisdiction). We do not knowingly collect personal information from
            children. If you believe a child has provided personal information
            to us, contact{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will
            take appropriate steps.
          </p>
        </section>

        <section>
          <h2>10. Policy updates</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the
            updated version on this page and revise the effective date above.
            Continued use of LeadOrbit after an update constitutes notice of the
            revised policy, except where applicable law requires additional
            notice or consent.
          </p>
        </section>

        <section>
          <h2>11. Contact information</h2>
          <p>
            For privacy questions or requests related to LeadOrbit:
          </p>
          <p>
            Email:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            <br />
            Product:{" "}
            <a href="https://leadorbit-delta.vercel.app">
              https://leadorbit-delta.vercel.app
            </a>
          </p>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
