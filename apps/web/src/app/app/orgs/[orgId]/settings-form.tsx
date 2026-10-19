"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { OrganizationDto } from "@leadorbit/api-contracts";
import { Button } from "@leadorbit/ui";

export function SettingsForm({ org }: { org: OrganizationDto }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        timezone: fd.get("timezone"),
        locale: fd.get("locale"),
        currency: fd.get("currency"),
        branding: {
          primaryColor: fd.get("primaryColor") || null,
          accentColor: fd.get("accentColor") || null,
          supportEmail: fd.get("supportEmail") || null,
        },
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(body?.detail ?? "Update failed");
      return;
    }
    setOk(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4 text-sm"
    >
      <label>
        Name
        <input
          name="name"
          defaultValue={org.name}
          className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label>
          Timezone
          <input
            name="timezone"
            defaultValue={org.timezone}
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
        <label>
          Locale
          <input
            name="locale"
            defaultValue={org.locale}
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
        <label>
          Currency
          <input
            name="currency"
            defaultValue={org.currency}
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label>
          Primary color
          <input
            name="primaryColor"
            defaultValue={org.branding.primaryColor ?? ""}
            placeholder="#3dd6a5"
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
        <label>
          Accent
          <input
            name="accentColor"
            defaultValue={org.branding.accentColor ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
        <label>
          Support email
          <input
            name="supportEmail"
            defaultValue={org.branding.supportEmail ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-[var(--lo-bg)] px-3 py-2"
          />
        </label>
      </div>
      {error ? <p className="text-red-300">{error}</p> : null}
      {ok ? <p className="text-[var(--lo-accent)]">Saved.</p> : null}
      <Button type="submit">Save settings</Button>
    </form>
  );
}
