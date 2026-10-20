"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Button } from "@leadorbit/ui";
import { clientSignIn } from "@/lib/auth/client-auth";
import { SiteFooter } from "@/components/site/site-footer";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const brandOrg = search.get("org");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (brandOrg) {
      router.replace(`/p/${brandOrg}/login`);
    }
  }, [brandOrg, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await clientSignIn({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.detail);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="lo-auth-shell">
      <aside className="lo-auth-aside">
        <div>
          <Link href="/" className="lo-mark text-2xl text-[var(--lo-fg)]">
            LeadOrbit
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[var(--lo-fg-muted)]">
            Sign in to your AI lead & revenue workspace. Campaigns, inbox, and
            results stay scoped to your organization.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-[var(--lo-fg-muted)]">
          <li>Org-isolated data and audit trail</li>
          <li>Honest integration status — no fake live connections</li>
          <li>
            <a
              href="https://github.com/rohitmehra86/LeadOrbit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--lo-accent-soft)] hover:underline"
            >
              Source on GitHub
            </a>
          </li>
        </ul>
      </aside>
      <div className="lo-auth-main">
        <h1 className="text-2xl">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
          Use the email and password from signup.
        </p>
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <label className="lo-field">
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="lo-field">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="lo-error">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-[var(--lo-fg-muted)]">
          No account?{" "}
          <Link className="text-[var(--lo-accent-soft)] underline" href="/signup">
            Create one
          </Link>
        </p>
        <div className="mt-12">
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="lo-auth-main mx-auto">
          <p className="lo-muted">Loading sign-in…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
