"use client";

import { FormEvent, useState } from "react";
import { Button } from "@leadorbit/ui";

export function InviteForm({ orgId }: { orgId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setToken(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${orgId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
        role: fd.get("role"),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(body?.detail ?? "Invite failed");
      return;
    }
    const data = (await res.json()) as { item: { token?: string } };
    setToken(data.item.token ?? "(token not returned)");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4 text-sm"
    >
      <label>
        Email
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
        />
      </label>
      <label>
        Role
        <select
          name="role"
          defaultValue="agent"
          className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
        >
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="agent">Agent</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
      {error ? <p className="text-red-300">{error}</p> : null}
      {token ? (
        <p className="break-all text-xs text-[var(--lo-accent)]">
          Invite token (share out-of-band): {token}
        </p>
      ) : null}
      <Button type="submit">Send invite</Button>
    </form>
  );
}
