"use client";

import { FormEvent, useState } from "react";
import { Button } from "@leadorbit/ui";

type PendingPack = {
  formId: string;
  pageId: string;
  pageSlug: string;
  campaignId: string;
};

type ChatResult = {
  status: string;
  report: string;
  plan: { summary: string; steps: Array<{ tool: string; reason: string }> };
  pendingPack?: PendingPack | null;
  results: Array<{ tool: string; ok: boolean; detail: string; data?: Record<string, unknown> }>;
};

type Msg = { role: "user" | "assistant"; text: string; meta?: ChatResult };

export function AssistantConsole({ orgId }: { orgId: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Tell me a goal — for example: “Launch a campaign for condo leads in Bangalore.” I’ll plan tools, ask for approval when publishing, then report exactly what ran.",
    },
  ]);
  const [pendingPack, setPendingPack] = useState<PendingPack | null>(null);
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
      body: JSON.stringify({ message, approve, pendingPack }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(body?.detail ?? "Assistant failed");
      return;
    }
    const data = (await res.json()) as ChatResult;
    setLastPlan(data);
    if (data.pendingPack) setPendingPack(data.pendingPack);
    const publicPath = data.results
      .flatMap((r) => {
        const pack = r.data?.pack as { publicPath?: string } | undefined;
        return pack?.publicPath ? [pack.publicPath] : [];
      })
      .at(-1);
    const text = [
      data.report,
      publicPath ? `Open capture page: ${publicPath}` : null,
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
          bypass.
        </p>
      </header>

      <div className="lo-chat" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`lo-chat-bubble lo-chat-${m.role}`}>
            <pre>{m.text}</pre>
          </div>
        ))}
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
            onClick={() => send(messages.filter((m) => m.role === "user").at(-1)?.text ?? "approve", true)}
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
