"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ChannelConnection,
  Conversation,
  InboxMessage,
  MessageTemplate,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  conversations: Conversation[];
  channels: ChannelConnection[];
  templates: MessageTemplate[];
};

export function InboxConsole(props: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(props.conversations[0]?.id ?? "");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function loadMessages(id: string) {
    setSelectedId(id);
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/inbox/conversations/${id}/messages`,
    );
    const data = (await res.json()) as { items: InboxMessage[] };
    setMessages(data.items);
    await fetch(`/api/v1/orgs/${props.orgId}/inbox/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unreadCount: 0 }),
    });
  }

  async function createConversation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/inbox/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: fd.get("channel"),
        contactAddress: fd.get("contactAddress"),
        subject: fd.get("subject"),
        slaHours: 24,
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) return;
    const fd = new FormData(e.currentTarget);
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/inbox/conversations/${selectedId}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: fd.get("body"),
          isInternalNote: fd.get("internal") === "on",
          scheduleAt: fd.get("scheduleAt") || null,
        }),
      },
    );
    const data = (await res.json()) as {
      message: InboxMessage;
      jobId: string | null;
    };
    setNote(
      data.jobId
        ? `Queued durable send job ${data.jobId} — status ${data.message.deliveryStatus}`
        : "Internal note saved",
    );
    e.currentTarget.reset();
    await loadMessages(selectedId);
    router.refresh();
  }

  async function authorize(channel: string) {
    const res = await fetch(`/api/v1/orgs/${props.orgId}/inbox/channels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    const data = (await res.json()) as { item: ChannelConnection };
    setNote(`${data.item.channel}: ${data.item.status} — ${data.item.lastError}`);
    router.refresh();
  }

  async function createTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/inbox/templates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: fd.get("channel"),
        key: fd.get("key"),
        name: fd.get("name"),
        body: fd.get("body"),
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  async function optOut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/inbox/opt-outs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: fd.get("channel"),
        address: fd.get("address"),
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  const filtered = props.conversations.filter((c) => {
    if (!q) return true;
    const hay = `${c.subject ?? ""} ${c.contactAddress ?? ""} ${c.tags.join(" ")}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr_280px]">
      <aside className="space-y-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search inbox"
          className="w-full rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
        />
        <form onSubmit={createConversation} className="grid gap-2">
          <select
            name="channel"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="website_chat">Website chat</option>
            <option value="messenger">Messenger</option>
            <option value="instagram">Instagram</option>
            <option value="voice">Voice</option>
          </select>
          <input
            name="contactAddress"
            placeholder="Contact address"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <input
            name="subject"
            placeholder="Subject"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <Button type="submit">New conversation</Button>
        </form>
        <ul className="space-y-2 text-sm">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void loadMessages(c.id)}
                className={`w-full rounded-md border px-3 py-2 text-left ${
                  selectedId === c.id
                    ? "border-[var(--lo-accent)]"
                    : "border-[var(--lo-border)]"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span>{c.subject ?? c.contactAddress ?? c.channel}</span>
                  {c.unreadCount > 0 ? <Badge>{c.unreadCount}</Badge> : null}
                </div>
                <span className="text-xs text-[var(--lo-fg-muted)]">
                  {c.channel} · {c.status}
                  {c.optedOut ? " · opted-out" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="space-y-3">
        <div className="min-h-64 space-y-2 rounded-md border border-[var(--lo-border)] p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-[var(--lo-fg-muted)]">
              Select a conversation to view history.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-md px-3 py-2 text-sm ${
                  m.isInternalNote
                    ? "border border-dashed border-[var(--lo-border)]"
                    : m.direction === "inbound"
                      ? "bg-[var(--lo-surface)]"
                      : "bg-[var(--lo-surface-elevated)]"
                }`}
              >
                <div className="mb-1 flex justify-between text-xs text-[var(--lo-fg-muted)]">
                  <span>
                    {m.direction}
                    {m.isInternalNote ? " · note" : ""}
                  </span>
                  <Badge>{m.deliveryStatus}</Badge>
                </div>
                <p>{m.body}</p>
                {m.error ? (
                  <p className="mt-1 text-xs text-red-300">{m.error}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
        <form onSubmit={send} className="grid gap-2">
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Reply or note…"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label>
              <input name="internal" type="checkbox" /> Internal note
            </label>
            <input
              name="scheduleAt"
              type="datetime-local"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-2 py-1"
            />
            <Button type="submit">Send / queue</Button>
          </div>
        </form>
        {note ? <p className="text-xs text-[var(--lo-fg-muted)]">{note}</p> : null}
      </section>

      <aside className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Channels</h2>
          <ul className="space-y-2 text-sm">
            {props.channels.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                <span>{c.channel}</span>
                <div className="flex items-center gap-2">
                  <Badge>{c.status}</Badge>
                  <Button type="button" onClick={() => authorize(c.channel)}>
                    Auth
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Templates</h2>
          <form onSubmit={createTemplate} className="grid gap-2">
            <input
              name="name"
              placeholder="Name"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="key"
              placeholder="key"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              name="channel"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="email">email</option>
              <option value="whatsapp">whatsapp</option>
              <option value="sms">sms</option>
            </select>
            <textarea
              name="body"
              placeholder="Body"
              rows={2}
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <Button type="submit">Add template</Button>
          </form>
          <ul className="text-xs text-[var(--lo-fg-muted)]">
            {props.templates.map((t) => (
              <li key={t.id}>
                {t.channel}/{t.key}: {t.name}
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={optOut} className="grid gap-2">
          <h2 className="text-lg font-medium">Opt-out</h2>
          <select
            name="channel"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="email">email</option>
            <option value="sms">sms</option>
            <option value="whatsapp">whatsapp</option>
          </select>
          <input
            name="address"
            required
            placeholder="address"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <Button type="submit">Record opt-out</Button>
        </form>
      </aside>
    </div>
  );
}
