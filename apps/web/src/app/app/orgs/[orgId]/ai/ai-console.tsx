"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AiEvalCase,
  AiPersona,
  AiTurnResult,
  AiUsageEvent,
  InventoryItem,
  KnowledgeCollection,
  KnowledgeDocument,
  VectorBackendStatus,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  gateway: {
    status: string;
    credentialsPresent: boolean;
    model: string;
    vectorBackend: VectorBackendStatus;
  };
  personas: AiPersona[];
  usage: AiUsageEvent[];
  turns: Array<{
    id: string;
    personaId: string | null;
    channel: string;
    userText: string;
    status: string;
    result: AiTurnResult;
    createdAt: string;
  }>;
  evals: AiEvalCase[];
  documents: KnowledgeDocument[];
  inventory: InventoryItem[];
  collections: KnowledgeCollection[];
  vectorBackend: VectorBackendStatus;
};

export function AiConsole(props: Props) {
  const router = useRouter();
  const [personaId, setPersonaId] = useState(props.personas[0]?.id ?? "");
  const [lastTurn, setLastTurn] = useState<AiTurnResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runTurn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/ai/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: fd.get("text"),
        channel: fd.get("channel") || "website_chat",
        personaId: personaId || undefined,
        locale: fd.get("locale") || undefined,
      }),
    });
    const data = (await res.json()) as { result?: AiTurnResult; detail?: string };
    setBusy(false);
    if (!res.ok || !data.result) {
      setNote(data.detail ?? "Run failed");
      return;
    }
    setLastTurn(data.result);
    router.refresh();
  }

  async function uploadDoc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/knowledge/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        kind: fd.get("kind"),
        rawText: fd.get("rawText"),
        mimeType: fd.get("kind") === "pdf" ? "application/pdf" : "text/plain",
      }),
    });
    const data = (await res.json()) as { warnings?: string[]; detail?: string };
    setNote(
      res.ok
        ? `Indexed document${data.warnings?.length ? ` — ${data.warnings.join("; ")}` : ""}`
        : data.detail ?? "Upload failed",
    );
    e.currentTarget.reset();
    router.refresh();
  }

  async function upsertInventory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const priceRaw = String(fd.get("price") ?? "").trim();
    await fetch(`/api/v1/orgs/${props.orgId}/knowledge/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: fd.get("sku"),
        name: fd.get("name"),
        price: priceRaw === "" ? null : Number(priceRaw),
        availability: fd.get("availability") || "unknown",
        category: fd.get("category") || null,
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  async function savePrompt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!personaId) return;
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/ai/personas/${personaId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemPrompt: fd.get("systemPrompt"),
        bumpPromptVersion: true,
        promptNote: "console edit",
      }),
    });
    setNote("Prompt version saved");
    router.refresh();
  }

  async function createAndRunEval() {
    const create = await fetch(`/api/v1/orgs/${props.orgId}/ai/evals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "No invented pricing",
        personaId: personaId || null,
        input: {
          text: "What is the price of the unicorn package?",
          channel: "api",
        },
        expected: { requireNoInventedPrice: true },
      }),
    });
    const created = (await create.json()) as { item?: AiEvalCase };
    if (!created.item) return;
    const run = await fetch(`/api/v1/orgs/${props.orgId}/ai/evals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ run: true, evalId: created.item.id }),
    });
    const out = (await run.json()) as { pass?: boolean };
    setNote(`Eval ${out.pass ? "passed" : "failed"}`);
    router.refresh();
  }

  const persona = props.personas.find((p) => p.id === personaId) ?? props.personas[0];

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap gap-3 text-sm">
        <Badge>LLM: {props.gateway.status}</Badge>
        <Badge>Model: {props.gateway.model}</Badge>
        <Badge>Vectors: {props.vectorBackend}</Badge>
        <Badge>
          Keys: {props.gateway.credentialsPresent ? "present (unverified until live OK)" : "absent"}
        </Badge>
      </section>

      {note ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {note}
        </p>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Run qualification turn</h2>
          <label className="text-sm text-[var(--lo-fg-muted)]">
            Persona
            <select
              className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2"
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
            >
              {props.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (v{p.promptVersion})
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={runTurn} className="flex flex-col gap-3">
            <textarea
              name="text"
              required
              rows={5}
              placeholder="Looking for a 3kW solar kit in Mumbai within 1 month, budget under $3000"
              className="w-full rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <select
                name="channel"
                className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                defaultValue="website_chat"
              >
                <option value="website_chat">Website chat</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="inbox">Inbox</option>
                <option value="api">API</option>
              </select>
              <input
                name="locale"
                placeholder="locale (en/hi/…)"
                className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Running…" : "Run agent"}
              </Button>
            </div>
          </form>

          {lastTurn ? (
            <div className="flex flex-col gap-2 whitespace-pre-wrap rounded-md border border-[var(--lo-border)] p-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{lastTurn.status}</Badge>
                <Badge>score {lastTurn.qualification.score}</Badge>
                <Badge>{lastTurn.language}</Badge>
                {lastTurn.escalated ? <Badge>escalated</Badge> : null}
              </div>
              <p>{lastTurn.reply}</p>
              <p className="text-[var(--lo-fg-muted)]">
                Next: {lastTurn.nextActions.join(" · ")}
              </p>
              {lastTurn.followUpDraft ? (
                <p>
                  <strong>Follow-up draft:</strong> {lastTurn.followUpDraft}
                </p>
              ) : null}
              {lastTurn.handoffSummary ? (
                <p>
                  <strong>Handoff:</strong> {lastTurn.handoffSummary}
                </p>
              ) : null}
              {lastTurn.sources.length > 0 ? (
                <ul className="list-disc pl-5 text-[var(--lo-fg-muted)]">
                  {lastTurn.sources.map((s) => (
                    <li key={s.chunkId}>
                      {s.title} ({s.score.toFixed(2)})
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Persona / policies</h2>
          {persona ? (
            <form onSubmit={savePrompt} className="flex flex-col gap-3">
              <textarea
                name="systemPrompt"
                rows={8}
                defaultValue={persona.systemPrompt}
                className="w-full rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
              />
              <p className="text-xs text-[var(--lo-fg-muted)]">
                Tools: {persona.allowedTools.join(", ")}. Never invent pricing:{" "}
                {String(persona.policies.neverInventPricing)}. Auth for
                consequential:{" "}
                {String(persona.policies.requireAuthForConsequential)}.
              </p>
              <Button type="submit">Save prompt version</Button>
            </form>
          ) : null}
          <Button type="button" onClick={createAndRunEval}>
            Run pricing honesty eval
          </Button>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Knowledge upload</h2>
          <p className="text-sm text-[var(--lo-fg-muted)]">
            Tenant-isolated RAG. Backend: {props.vectorBackend}. PDF binary OCR is
            not claimed — paste text extracts.
          </p>
          <form onSubmit={uploadDoc} className="flex flex-col gap-2">
            <input
              name="title"
              required
              placeholder="Title"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              name="kind"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
              defaultValue="faq"
            >
              <option value="faq">FAQ</option>
              <option value="catalog">Catalog</option>
              <option value="brochure">Brochure</option>
              <option value="pdf">PDF (text extract)</option>
              <option value="text">Text</option>
            </select>
            <textarea
              name="rawText"
              required
              rows={5}
              placeholder="Paste FAQ / brochure / catalog text…"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <Button type="submit">Upload & index</Button>
          </form>
          <ul className="text-sm">
            {props.documents.map((d) => (
              <li key={d.id} className="border-t border-[var(--lo-border)] py-2">
                {d.title} · {d.kind} · {d.status} · v{d.version}
              </li>
            ))}
            {props.documents.length === 0 ? (
              <li className="text-[var(--lo-fg-muted)]">No documents yet</li>
            ) : null}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Authoritative inventory</h2>
          <p className="text-sm text-[var(--lo-fg-muted)]">
            SQL prices/availability — AI must not invent when missing.
          </p>
          <form onSubmit={upsertInventory} className="grid gap-2 sm:grid-cols-2">
            <input
              name="sku"
              required
              placeholder="SKU"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="name"
              required
              placeholder="Name"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="price"
              placeholder="Price (blank = unknown)"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              name="availability"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
              defaultValue="in_stock"
            >
              <option value="in_stock">In stock</option>
              <option value="limited">Limited</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="unknown">Unknown</option>
            </select>
            <input
              name="category"
              placeholder="Category"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm sm:col-span-2"
            />
            <Button type="submit">Upsert item</Button>
          </form>
          <ul className="text-sm">
            {props.inventory.map((i) => (
              <li key={i.id} className="border-t border-[var(--lo-border)] py-2">
                {i.sku} — {i.name}:{" "}
                {i.price == null ? "price on request" : i.price} · {i.availability}
              </li>
            ))}
            {props.inventory.length === 0 ? (
              <li className="text-[var(--lo-fg-muted)]">No inventory rows</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xl font-semibold">Usage / cost</h2>
          <ul className="text-sm">
            {props.usage.slice(0, 8).map((u) => (
              <li key={u.id} className="border-t border-[var(--lo-border)] py-2">
                {u.createdAt.slice(11, 19)} · {u.status} · {u.model} ·{" "}
                {u.promptTokens}+{u.completionTokens} tok · $
                {u.estimatedCostUsd ?? "—"}
              </li>
            ))}
            {props.usage.length === 0 ? (
              <li className="text-[var(--lo-fg-muted)]">No usage yet</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-xl font-semibold">Recent turns / evals</h2>
          <ul className="text-sm">
            {props.turns.slice(0, 5).map((t) => (
              <li key={t.id} className="border-t border-[var(--lo-border)] py-2">
                {t.status} · score {t.result.qualification?.score ?? "—"} ·{" "}
                {t.userText.slice(0, 80)}
              </li>
            ))}
            {props.evals.map((e) => (
              <li key={e.id} className="border-t border-[var(--lo-border)] py-2">
                Eval {e.name}: last score {e.lastScore ?? "—"}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
