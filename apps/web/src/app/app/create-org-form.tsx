"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@leadorbit/ui";

export function CreateOrgForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        orgType: fd.get("orgType") || "workspace",
        timezone: fd.get("timezone") || "UTC",
        locale: fd.get("locale") || "en-US",
        currency: fd.get("currency") || "USD",
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(body?.detail ?? "Could not create organization");
      return;
    }
    const data = (await res.json()) as { item: { id: string } };
    router.push(`/app/orgs/${data.item.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid max-w-xl gap-3 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4"
    >
      <label className="text-sm">
        Name
        <input
          name="name"
          required
          className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Type
          <select
            name="orgType"
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          >
            <option value="workspace">Workspace</option>
            <option value="agency">Agency</option>
          </select>
        </label>
        <label className="text-sm">
          Currency
          <input
            name="currency"
            defaultValue="USD"
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Timezone
          <input
            name="timezone"
            defaultValue="UTC"
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Locale
          <input
            name="locale"
            defaultValue="en-US"
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}
