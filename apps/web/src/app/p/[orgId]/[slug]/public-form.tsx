"use client";

import { FormEvent, useMemo, useState } from "react";
import type { FormField } from "@leadorbit/domain";
import { visibleFieldsForStep } from "@leadorbit/domain";
import { Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  formId: string;
  pageId?: string | null;
  campaignId: string | null;
  thankYou: string;
  fields: FormField[];
  multiStep: boolean;
};

export function PublicForm({
  orgId,
  formId,
  pageId,
  campaignId,
  thankYou,
  fields,
  multiStep,
}: Props) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const maxStep = useMemo(
    () => Math.max(0, ...safeFields.map((f) => Number(f.step) || 0)),
    [safeFields],
  );
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = visibleFieldsForStep(safeFields, values, step);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (multiStep && step < maxStep) {
      setStep((s) => s + 1);
      return;
    }
    const res = await fetch(`/api/v1/public/forms/${orgId}/${formId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: values,
        honeypot: "",
        campaignId,
        pageId: pageId ?? null,
        utm: {
          utmSource: new URLSearchParams(window.location.search).get("utm_source") ?? undefined,
          utmMedium: new URLSearchParams(window.location.search).get("utm_medium") ?? undefined,
          utmCampaign: new URLSearchParams(window.location.search).get("utm_campaign") ?? undefined,
        },
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { detail?: string };
      setError(data.detail ?? "Submit failed");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-md border border-[var(--lo-border)] px-4 py-6 text-sm">
        {thankYou}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      {/* honeypot */}
      <input
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />
      {visible.map((f) => (
        <label key={f.id} className="grid gap-1 text-sm">
          <span>
            {f.label}
            {f.required ? " *" : ""}
          </span>
          {f.type === "textarea" ? (
            <textarea
              required={f.required}
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2"
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          ) : f.type === "select" ? (
            <select
              required={f.required}
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2"
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            >
              <option value="">Select…</option>
              {(Array.isArray(f.options) ? f.options : []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === "consent" ? (
            <input
              type="checkbox"
              required={f.required}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.checked }))
              }
            />
          ) : f.type === "hidden" ? null : (
            <input
              type={f.type === "email" ? "email" : f.type === "number" ? "number" : "text"}
              required={f.required}
              placeholder={f.placeholder ?? undefined}
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2"
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          )}
        </label>
      ))}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <Button type="submit">
        {multiStep && step < maxStep ? "Continue" : "Submit"}
      </Button>
    </form>
  );
}
