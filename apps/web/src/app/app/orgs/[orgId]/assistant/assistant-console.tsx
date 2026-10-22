"use client";

import { FormEvent, useState } from "react";
import { Button } from "@leadorbit/ui";

type PendingPack = {
  formId: string;
  pageId: string;
  pageSlug: string;
  campaignId: string;
};

type PendingMetaPlan = {
  plan: Record<string, unknown>;
  campaignId: string;
};

type ChatResult = {
  status: string;
  report: string;
  plan: { summary: string; steps: Array<{ tool: string; reason: string }> };
  pendingPack?: PendingPack | null;
  pendingMetaPlan?: PendingMetaPlan | null;
  results: Array<{ tool: string; ok: boolean; detail: string; data?: Record<string, unknown> }>;
};

type Msg = { role: "user" | "assistant"; text: string; meta?: ChatResult };

const STARTERS = [
  "Launch Meta ads for condo leads in Bangalore, $25/day",
  "Launch a campaign for condo leads in Bangalore",
  "Show hot leads that need attention",
];

export function AssistantConsole({ orgId }: { orgId: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Tell me a goal — Launch with Meta (AI), local Launch Pack, convert a lead, or check Results. Meta create/spend always needs your Approve.",
    },
  ]);
  const [pendingPack, setPendingPack] = useState<PendingPack | null>(null);
  const [pendingMetaPlan, setPendingMetaPlan] = useState<PendingMetaPlan | null>(
    null,
  );
  const [lastPlan, setLastPlan] = useState<ChatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(message: string, approve = false) {
    setLoading(true);
    setError(null);
    if (!approve) {
      setMessages((m) => [...m, { role: "user", text: message }]);
    }
    const res = await fetch(`/api/v1/orgs/${orgId}/assistant/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, approve, pendingPack, pendingMetaPlan }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(body?.detail ?? "Assistant failed");
      return;
    }
    const data = (await res.json()) as ChatResult;
    setLastPlan(data);
    if (data.pendingPack !== undefined) setPendingPack(data.pendingPack);
    if (data.pendingMetaPlan !== undefined) setPendingMetaPlan(data.pendingMetaPlan);
    const publicPath = data.results
      .flatMap((r) => {
        const pack = r.data?.pack as { publicPath?: string } | undefined;
        return pack?.publicPath ? [pack.publicPath] : [];
      })
      .at(-1);
    const metaHint = data.pendingMetaPlan
      ? "Meta plan drafted. Say “approve” (then Approve & run) to create on Meta — or draft stays pending_configuration without credentials."
      : null;
    const text = [
      data.report,
      publicPath ? `Open capture page: ${publicPath}` : null,
      metaHint,
    ]
      .filter(Boolean)
      .join("\n");
    setMessages((m) => [...m, { role: "assistant", text, meta: data }]);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const message = String(fd.get("message") ?? "").trim();
    if (!message) return;
    e.currentTarget.reset();
    await send(message, false);
  }

  return (
    <div className="lo-assistant">
      <header className="lo-panel-head">
        <h1>AI Assistant</h1>
        <p>
          Intent → org tools → approval for publish → exact success/fail report. No permission
          bypass. Ink + saffron shell.
        </p>
      </header>

      {messages.length <= 1 ? (
        <div className="lo-starter-chips" aria-label="Suggested goals">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              className="lo-chip"
              disabled={loading}
              onClick={() => send(s, false)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="lo-chat" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`lo-chat-bubble lo-chat-${m.role}`}>
            <pre>{m.text}</pre>
            {m.meta?.results?.length ? (
              <ul className="lo-tool-results">
                {m.meta.results.map((r) => (
                  <li key={`${r.tool}-${r.detail}`} className={r.ok ? "ok" : "fail"}>
                    <code>{r.tool}</code> {r.ok ? "ok" : "failed"} — {r.detail}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {loading ? (
          <div className="lo-chat-bubble lo-chat-assistant lo-typing" aria-busy="true">
            Planning tools…
          </div>
        ) : null}
      </div>

      {lastPlan?.status === "needs_approval" ? (
        <div className="lo-approve">
          <p>
            <strong>Approval required:</strong> {lastPlan.plan.summary}
          </p>
          <ul>
            {lastPlan.plan.steps.map((s) => (
              <li key={s.tool}>
                <code>{s.tool}</code> — {s.reason}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            disabled={loading}
            onClick={() =>
              send(messages.filter((m) => m.role === "user").at(-1)?.text ?? "approve", true)
            }
          >
            Approve & run
          </Button>
        </div>
      ) : null}

      {error ? <p className="lo-error">{error}</p> : null}

      <form onSubmit={onSubmit} className="lo-chat-form">
        <label className="sr-only" htmlFor="assistant-message">
          Message
        </label>
        <input
          id="assistant-message"
          name="message"
          placeholder="Launch a campaign for condo leads in Bangalore"
          disabled={loading}
          required
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Working…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
