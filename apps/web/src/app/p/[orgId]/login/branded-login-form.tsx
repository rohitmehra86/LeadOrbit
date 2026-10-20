"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@leadorbit/ui";
import { clientSignIn } from "@/lib/auth/client-auth";

export function BrandedLoginForm(props: {
  accent: string;
  primary: string;
  hideLeadOrbit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="rounded-md border border-white/20 bg-black/25 px-3 py-2 text-white placeholder:text-white/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="rounded-md border border-white/20 bg-black/25 px-3 py-2 text-white"
          />
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <Button
          type="submit"
          disabled={loading}
          style={{ background: props.accent, color: props.primary }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {!props.hideLeadOrbit ? (
        <p className="mt-8 text-xs text-white/40">
          Powered by{" "}
          <Link href="/" className="underline">
            LeadOrbit
          </Link>
        </p>
      ) : null}
    </>
  );
}
