"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign, FormDefinition, FormField, FormFieldType } from "@leadorbit/domain";
import { Button, Badge } from "@leadorbit/ui";

type Props = {
  orgId: string;
  forms: FormDefinition[];
  campaigns: Campaign[];
};

export function FormBuilder({ orgId, forms, campaigns }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(forms[0]?.id ?? "");
  const selected = useMemo(
    () => forms.find((f) => f.id === selectedId) ?? forms[0] ?? null,
    [forms, selectedId],
  );
  const [fields, setFields] = useState<FormField[]>(selected?.fields ?? []);
  const [dragId, setDragId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<
    Array<{ id: string; createdAt: string; leadId: string | null; duplicateOfId: string | null }>
  >([]);

  function syncSelected(form: FormDefinition | null) {
    setSelectedId(form?.id ?? "");
    setFields(form?.fields ?? []);
    setSubmissions([]);
  }

  async function createForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${orgId}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        campaignId: fd.get("campaignId") || null,
        templateKey: "lead_gen",
        multiStep: true,
      }),
    });
    const data = (await res.json()) as { item: FormDefinition };
    syncSelected(data.item);
    e.currentTarget.reset();
    router.refresh();
  }

  async function saveFields() {
    if (!selected) return;
    const res = await fetch(`/api/v1/orgs/${orgId}/forms/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (res.ok) {
      setMessage(`Saved version bump for ${selected.name}`);
      router.refresh();
    }
  }

  async function publish() {
    if (!selected) return;
    await fetch(`/api/v1/orgs/${orgId}/forms/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "published", fields }),
    });
    setMessage("Form published");
    router.refresh();
  }

  async function duplicate() {
    if (!selected) return;
    const res = await fetch(
      `/api/v1/orgs/${orgId}/forms/${selected.id}/duplicate`,
      { method: "POST" },
    );
    const data = (await res.json()) as { item: FormDefinition };
    syncSelected(data.item);
    router.refresh();
  }

  async function loadSubs() {
    if (!selected) return;
    const res = await fetch(
      `/api/v1/orgs/${orgId}/forms/${selected.id}/submissions`,
    );
    const data = (await res.json()) as { items: typeof submissions };
    setSubmissions(data.items);
  }

  function addField(type: FormFieldType) {
    const id = crypto.randomUUID();
    setFields((prev) => [
      ...prev,
      {
        id,
        key: `field_${prev.length + 1}`,
        label: type === "consent" ? "Consent" : `New ${type}`,
        type,
        required: type === "email" || type === "consent",
        options: type === "select" ? ["Option A", "Option B"] : [],
        placeholder: null,
        showWhen: null,
        step: 0,
        position: prev.length,
        crmMapTo:
          type === "email"
            ? "email"
            : type === "phone"
              ? "phone"
              : type === "text"
                ? "fullName"
                : null,
        customCrmKey: null,
      },
    ]);
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setFields((prev) => {
      const next = [...prev];
      const from = next.findIndex((f) => f.id === dragId);
      const to = next.findIndex((f) => f.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next.map((f, i) => ({ ...f, position: i }));
    });
    setDragId(null);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <form onSubmit={createForm} className="grid gap-2">
          <input
            name="name"
            required
            placeholder="Form name"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <select
            name="campaignId"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="">No campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="submit">Create from template</Button>
        </form>
        <ul className="space-y-2 text-sm">
          {forms.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => syncSelected(f)}
                className={`w-full rounded-md border px-3 py-2 text-left ${
                  selected?.id === f.id
                    ? "border-[var(--lo-accent)]"
                    : "border-[var(--lo-border)]"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span>{f.name}</span>
                  <Badge>{f.status}</Badge>
                </div>
                <span className="text-xs text-[var(--lo-fg-muted)]">
                  v{f.version} · {f.fields.length} fields
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="space-y-4">
        {!selected ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">
            Create a form to start editing.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-medium">{selected.name}</h2>
              <Badge>{selected.status}</Badge>
              <Badge>v{selected.version}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                ["text", "email", "phone", "select", "consent", "hidden"] as FormFieldType[]
              ).map((t) => (
                <Button key={t} type="button" onClick={() => addField(t)}>
                  + {t}
                </Button>
              ))}
            </div>
            <ul className="space-y-2">
              {fields.map((f) => (
                <li
                  key={f.id}
                  draggable
                  onDragStart={() => setDragId(f.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(f.id)}
                  className="cursor-grab rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--lo-fg-muted)]">⋮⋮</span>
                    <input
                      value={f.label}
                      onChange={(e) =>
                        setFields((prev) =>
                          prev.map((x) =>
                            x.id === f.id ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                      className="flex-1 bg-transparent text-sm font-medium outline-none"
                    />
                    <Badge>{f.type}</Badge>
                    <label className="text-xs text-[var(--lo-fg-muted)]">
                      step{" "}
                      <input
                        type="number"
                        min={0}
                        value={f.step}
                        onChange={(e) =>
                          setFields((prev) =>
                            prev.map((x) =>
                              x.id === f.id
                                ? { ...x, step: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                        className="w-12 bg-transparent"
                      />
                    </label>
                    <label className="text-xs">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) =>
                          setFields((prev) =>
                            prev.map((x) =>
                              x.id === f.id
                                ? { ...x, required: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />{" "}
                      required
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-[var(--lo-fg-muted)]">
                    key={f.key}
                    {f.crmMapTo ? ` · CRM→${f.crmMapTo}` : ""}
                    {f.type === "hidden" ? " · UTM/hidden" : ""}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveFields}>
                Save fields
              </Button>
              <Button type="button" onClick={publish}>
                Publish
              </Button>
              <Button type="button" onClick={duplicate}>
                Duplicate
              </Button>
              <Button type="button" onClick={loadSubs}>
                Submissions
              </Button>
            </div>
            {message ? (
              <p className="text-sm text-[var(--lo-fg-muted)]">{message}</p>
            ) : null}
            {selected.embedEnabled ? (
              <pre className="overflow-x-auto rounded-md border border-[var(--lo-border)] p-3 text-xs text-[var(--lo-fg-muted)]">
{`<script src="/embed/form.js" data-org="${orgId}" data-form="${selected.id}"></script>`}
              </pre>
            ) : null}
            {submissions.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {submissions.map((s) => (
                  <li key={s.id} className="font-mono text-xs">
                    {s.createdAt} · lead={s.leadId ?? "—"}
                    {s.duplicateOfId ? " · duplicate" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
