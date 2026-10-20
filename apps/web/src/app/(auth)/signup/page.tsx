"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@leadorbit/ui";
import { clientSignUp } from "@/lib/auth/client-auth";
import { SiteFooter } from "@/components/site/site-footer";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await clientSignUp({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      fullName: String(fd.get("fullName") ?? "") || undefined,
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
            Create an account, then spin up a workspace. First local/staging
            user becomes platform admin for ops tooling.
          </p>
        </div>
        <p className="text-sm text-[var(--lo-fg-muted)]">
          Already running demos?{" "}
          <Link href="/login" className="text-[var(--lo-accent-soft)] underline">
            Sign in instead
          </Link>
        </p>
      </aside>
      <div className="lo-auth-main">
        <h1 className="text-2xl">Create account</h1>
        <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
          Password must be at least 8 characters.
        </p>
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <label className="lo-field">
            Full name
            <input name="fullName" autoComplete="name" />
          </label>
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
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="lo-error">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-[var(--lo-fg-muted)]">
          Already have an account?{" "}
          <Link className="text-[var(--lo-accent-soft)] underline" href="/login">
            Sign in
          </Link>
        </p>
        <div className="mt-12">
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
