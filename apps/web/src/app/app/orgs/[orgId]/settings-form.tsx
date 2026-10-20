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
      className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4 text-sm"
    >
      <label className="lo-field">
        Name
        <input name="name" defaultValue={org.name} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="lo-field">
          Timezone
          <input name="timezone" defaultValue={org.timezone} />
        </label>
        <label className="lo-field">
          Locale
          <input name="locale" defaultValue={org.locale} />
        </label>
        <label className="lo-field">
          Currency
          <input name="currency" defaultValue={org.currency} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="lo-field">
          Primary color
          <input
            name="primaryColor"
            defaultValue={org.branding.primaryColor ?? ""}
            placeholder="#3b82f6"
          />
        </label>
        <label className="lo-field">
          Accent
          <input
            name="accentColor"
            defaultValue={org.branding.accentColor ?? ""}
            placeholder="#93c5fd"
          />
        </label>
        <label className="lo-field">
          Support email
          <input
            name="supportEmail"
            type="email"
            defaultValue={org.branding.supportEmail ?? ""}
            placeholder="support@example.com"
          />
        </label>
      </div>
      {error ? <p className="lo-error">{error}</p> : null}
      {ok ? <p className="text-sm text-[var(--lo-success)]">Saved.</p> : null}
      <Button type="submit">Save brand settings</Button>
    </form>
  );
}
