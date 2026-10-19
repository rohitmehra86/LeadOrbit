"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@leadorbit/ui";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: fd.get("token") }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(body?.detail ?? "Accept failed");
      return;
    }
    const data = (await res.json()) as { item: { orgId: string } };
    router.push(`/app/orgs/${data.item.orgId}`);
    router.refresh();
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">Accept invite</h1>
      <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
        Paste the invite token. Your signed-in email must match the invite.
      </p>
      <form onSubmit={onSubmit} className="mt-6 grid gap-3">
        <textarea
          name="token"
          required
          rows={3}
          className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-2 font-mono text-xs"
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <Button type="submit">Join organization</Button>
      </form>
    </div>
  );
}
