import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  attemptProviderSend,
  authorizeMessagingChannel,
  hasPermission,
  type ChannelConnection,
  type Conversation,
  type ConversationStatus,
  type InboxChannel,
  type InboxMessage,
  type MessageTemplate,
  type OptOutRecord
} from "@leadorbit/domain";
import {
  verifyMessagingWebhook
} from "@leadorbit/domain/server";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";

function nowIso(): string {
  return new Date().toISOString();
}

function jparse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const CHANNELS: InboxChannel[] = [
  "whatsapp",
  "email",
  "sms",
  "website_chat",
  "messenger",
  "instagram",
  "voice",
];

export class InboxStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private queue: SqliteJobQueue = new SqliteJobQueue(db),
  ) {}

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "inbox:read" | "inbox:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  ensureChannels(orgId: string): void {
    const now = nowIso();
    for (const channel of CHANNELS) {
      const auth = authorizeMessagingChannel(channel);
      this.db
        .prepare(
          `insert into channel_connections(id, org_id, channel, status, webhook_secret, config, last_error, created_at, updated_at)
           values (?,?,?,?,?,?,?,?,?)
           on conflict(org_id, channel) do nothing`,
        )
        .run(
          randomUUID(),
          orgId,
          channel,
          auth.status === "authorized_stub" ? "authorized_stub" : auth.status,
          `msgsec_${randomBytes(16).toString("hex")}`,
          JSON.stringify({}),
          auth.detail,
          now,
          now,
        );
    }
  }

  private mapConversation(r: Record<string, unknown>): Conversation {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as InboxChannel,
      subject: r.subject ? String(r.subject) : null,
      status: r.status as ConversationStatus,
      assigneeUserId: r.assignee_user_id ? String(r.assignee_user_id) : null,
      leadId: r.lead_id ? String(r.lead_id) : null,
      contactAddress: r.contact_address ? String(r.contact_address) : null,
      unreadCount: Number(r.unread_count),
      tags: jparse(String(r.tags), []),
      slaDueAt: r.sla_due_at ? String(r.sla_due_at) : null,
      lastMessageAt: r.last_message_at ? String(r.last_message_at) : null,
      consentOk: Boolean(r.consent_ok),
      optedOut: Boolean(r.opted_out),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapMessage(r: Record<string, unknown>): InboxMessage {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      conversationId: String(r.conversation_id),
      direction: r.direction as InboxMessage["direction"],
      channel: r.channel as InboxChannel,
      body: String(r.body),
      htmlBody: r.html_body ? String(r.html_body) : null,
      templateKey: r.template_key ? String(r.template_key) : null,
      attachmentPaths: jparse(String(r.attachment_paths), []),
      deliveryStatus: r.delivery_status as InboxMessage["deliveryStatus"],
      providerMessageId: r.provider_message_id
        ? String(r.provider_message_id)
        : null,
      senderUserId: r.sender_user_id ? String(r.sender_user_id) : null,
      isInternalNote: Boolean(r.is_internal_note),
      error: r.error ? String(r.error) : null,
      createdAt: String(r.created_at),
    };
  }

  async listConversations(
    actor: SessionUser,
    orgId: string,
    opts?: { q?: string; status?: string; channel?: string },
  ): Promise<Conversation[]> {
    await this.gate(actor, orgId, "inbox:read");
    this.ensureChannels(orgId);
    let rows = this.db
      .prepare(
        `select * from conversations where org_id=? order by coalesce(last_message_at, created_at) desc`,
      )
      .all(orgId) as Record<string, unknown>[];
    if (opts?.status) rows = rows.filter((r) => r.status === opts.status);
    if (opts?.channel) rows = rows.filter((r) => r.channel === opts.channel);
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.subject ?? "")
            .toLowerCase()
            .includes(q) ||
          String(r.contact_address ?? "")
            .toLowerCase()
            .includes(q) ||
          String(r.tags ?? "")
            .toLowerCase()
            .includes(q),
      );
    }
    return rows.map((r) => this.mapConversation(r));
  }

  async createConversation(
    actor: SessionUser,
    orgId: string,
    input: {
      channel: InboxChannel;
      subject?: string;
      contactAddress?: string;
      leadId?: string | null;
      slaHours?: number;
    },
  ): Promise<Conversation> {
    await this.gate(actor, orgId, "inbox:write");
    this.ensureChannels(orgId);
    const id = randomUUID();
    const now = nowIso();
    const slaDueAt = input.slaHours
      ? new Date(Date.now() + input.slaHours * 3600_000).toISOString()
      : null;
    this.db
      .prepare(
        `insert into conversations(
          id, org_id, channel, subject, status, assignee_user_id, lead_id, contact_address,
          unread_count, tags, sla_due_at, last_message_at, consent_ok, opted_out, created_at, updated_at
        ) values (?,?,?,?,'open',?,?,?,0,'[]',?,null,1,0,?,?)`,
      )
      .run(
        id,
        orgId,
        input.channel,
        input.subject ?? null,
        null,
        input.leadId ?? null,
        input.contactAddress ?? null,
        slaDueAt,
        now,
        now,
      );
    return this.mapConversation(
      this.db
        .prepare(`select * from conversations where id=?`)
        .get(id) as Record<string, unknown>,
    );
  }

  async updateConversation(
    actor: SessionUser,
    orgId: string,
    conversationId: string,
    patch: Partial<{
      status: ConversationStatus;
      assigneeUserId: string | null;
      tags: string[];
      unreadCount: number;
    }>,
  ): Promise<Conversation> {
    await this.gate(actor, orgId, "inbox:write");
    const row = this.db
      .prepare(`select * from conversations where org_id=? and id=?`)
      .get(orgId, conversationId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Conversation not found", "not_found");
    const c = this.mapConversation(row);
    const next = {
      ...c,
      ...patch,
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        `update conversations set status=?, assignee_user_id=?, tags=?, unread_count=?, updated_at=?
         where id=?`,
      )
      .run(
        next.status,
        next.assigneeUserId,
        JSON.stringify(next.tags),
        next.unreadCount,
        next.updatedAt,
        conversationId,
      );
    return next;
  }

  async listMessages(
    actor: SessionUser,
    orgId: string,
    conversationId: string,
  ): Promise<InboxMessage[]> {
    await this.gate(actor, orgId, "inbox:read");
    const rows = this.db
      .prepare(
        `select * from inbox_messages where org_id=? and conversation_id=? order by created_at asc`,
      )
      .all(orgId, conversationId) as Record<string, unknown>[];
    return rows.map((r) => this.mapMessage(r));
  }

  async addMessage(
    actor: SessionUser,
    orgId: string,
    input: {
      conversationId: string;
      body: string;
      isInternalNote?: boolean;
      templateKey?: string | null;
      attachmentPaths?: string[];
      scheduleAt?: string | null;
    },
  ): Promise<{ message: InboxMessage; jobId: string | null }> {
    await this.gate(actor, orgId, "inbox:write");
    const conv = this.db
      .prepare(`select * from conversations where org_id=? and id=?`)
      .get(orgId, input.conversationId) as Record<string, unknown> | undefined;
    if (!conv) throw new AuthError("Conversation not found", "not_found");
    const conversation = this.mapConversation(conv);

    if (input.isInternalNote) {
      const id = randomUUID();
      const now = nowIso();
      this.db
        .prepare(
          `insert into inbox_messages(
            id, org_id, conversation_id, direction, channel, body, html_body, template_key,
            attachment_paths, delivery_status, provider_message_id, sender_user_id, is_internal_note, error, created_at
          ) values (?,?,?,'internal',?,?,?,?,?,'delivered',null,?,1,null,?)`,
        )
        .run(
          id,
          orgId,
          conversation.id,
          conversation.channel,
          input.body,
          null,
          null,
          JSON.stringify(input.attachmentPaths ?? []),
          actor.id,
          now,
        );
      return {
        message: this.mapMessage(
          this.db
            .prepare(`select * from inbox_messages where id=?`)
            .get(id) as Record<string, unknown>,
        ),
        jobId: null,
      };
    }

    if (conversation.optedOut) {
      throw new AuthError("Contact opted out of this channel", "conflict");
    }

    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into inbox_messages(
          id, org_id, conversation_id, direction, channel, body, html_body, template_key,
          attachment_paths, delivery_status, provider_message_id, sender_user_id, is_internal_note, error, created_at
        ) values (?,?,?,'outbound',?,?,?,?,?,'queued',null,?,0,null,?)`,
      )
      .run(
        id,
        orgId,
        conversation.id,
        conversation.channel,
        input.body,
        null,
        input.templateKey ?? null,
        JSON.stringify(input.attachmentPaths ?? []),
        actor.id,
        now,
      );
    this.db
      .prepare(
        `update conversations set last_message_at=?, updated_at=? where id=?`,
      )
      .run(now, now, conversation.id);

    const delayMs = input.scheduleAt
      ? Math.max(0, new Date(input.scheduleAt).getTime() - Date.now())
      : 0;
    const job = this.queue.enqueue(
      "message.send",
      { orgId, messageId: id },
      { idempotencyKey: `msg-send:${id}`, delayMs },
    );
    return {
      message: this.mapMessage(
        this.db
          .prepare(`select * from inbox_messages where id=?`)
          .get(id) as Record<string, unknown>,
      ),
      jobId: job.jobId,
    };
  }

  /** Worker: attempt provider send for queued message. */
  processMessageSend(orgId: string, messageId: string): void {
    const row = this.db
      .prepare(`select * from inbox_messages where org_id=? and id=?`)
      .get(orgId, messageId) as Record<string, unknown> | undefined;
    if (!row) return;
    const msg = this.mapMessage(row);
    if (msg.isInternalNote) return;
    const conv = this.db
      .prepare(`select * from conversations where id=?`)
      .get(msg.conversationId) as Record<string, unknown> | undefined;
    if (!conv) return;
    const conversation = this.mapConversation(conv);
    if (conversation.optedOut) {
      this.db
        .prepare(
          `update inbox_messages set delivery_status='opted_out', error=?, provider_message_id=null where id=?`,
        )
        .run("Contact opted out", messageId);
      return;
    }
    const result = attemptProviderSend({
      channel: msg.channel,
      to: conversation.contactAddress ?? "unknown",
      body: msg.body,
      testMode: false,
    });
    this.db
      .prepare(
        `update inbox_messages set delivery_status=?, provider_message_id=?, error=? where id=?`,
      )
      .run(
        result.deliveryStatus,
        result.providerMessageId,
        result.error,
        messageId,
      );
  }

  async listTemplates(
    actor: SessionUser,
    orgId: string,
  ): Promise<MessageTemplate[]> {
    await this.gate(actor, orgId, "inbox:read");
    const rows = this.db
      .prepare(`select * from message_templates where org_id=?`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as InboxChannel,
      key: String(r.key),
      name: String(r.name),
      body: String(r.body),
      createdAt: String(r.created_at),
    }));
  }

  async createTemplate(
    actor: SessionUser,
    orgId: string,
    input: { channel: InboxChannel; key: string; name: string; body: string },
  ): Promise<MessageTemplate> {
    await this.gate(actor, orgId, "inbox:write");
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into message_templates(id, org_id, channel, key, name, body, created_at)
         values (?,?,?,?,?,?,?)`,
      )
      .run(id, orgId, input.channel, input.key, input.name, input.body, now);
    return {
      id,
      orgId,
      channel: input.channel,
      key: input.key,
      name: input.name,
      body: input.body,
      createdAt: now,
    };
  }

  async listChannelConnections(
    actor: SessionUser,
    orgId: string,
  ): Promise<ChannelConnection[]> {
    await this.gate(actor, orgId, "inbox:read");
    this.ensureChannels(orgId);
    const rows = this.db
      .prepare(`select * from channel_connections where org_id=?`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as InboxChannel,
      status: r.status as ChannelConnection["status"],
      webhookSecret: r.webhook_secret ? String(r.webhook_secret) : null,
      config: jparse(String(r.config), {}),
      lastError: r.last_error ? String(r.last_error) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async authorizeChannel(
    actor: SessionUser,
    orgId: string,
    channel: InboxChannel,
  ): Promise<ChannelConnection> {
    await this.gate(actor, orgId, "inbox:write");
    this.ensureChannels(orgId);
    const auth = authorizeMessagingChannel(channel);
    const now = nowIso();
    this.db
      .prepare(
        `update channel_connections set status=?, last_error=?, updated_at=? where org_id=? and channel=?`,
      )
      .run(auth.status, auth.detail, now, orgId, channel);
    return (await this.listChannelConnections(actor, orgId)).find(
      (c) => c.channel === channel,
    )!;
  }

  async addOptOut(
    actor: SessionUser,
    orgId: string,
    channel: InboxChannel,
    address: string,
  ): Promise<OptOutRecord> {
    await this.gate(actor, orgId, "inbox:write");
    const id = randomUUID();
    const now = nowIso();
    const normalized = address.trim().toLowerCase();
    this.db
      .prepare(
        `insert into opt_outs(id, org_id, channel, address, created_at)
         values (?,?,?,?,?)
         on conflict(org_id, channel, address) do nothing`,
      )
      .run(id, orgId, channel, normalized, now);
    this.db
      .prepare(
        `update conversations set opted_out=1, updated_at=? where org_id=? and channel=? and lower(contact_address)=?`,
      )
      .run(now, orgId, channel, normalized);
    return { id, orgId, channel, address: normalized, createdAt: now };
  }

  /**
   * Inbound messaging webhook with signature validation.
   */
  async processInboundWebhook(input: {
    orgId: string;
    channel: InboxChannel;
    rawBody: string;
    timestamp: string;
    signature: string;
  }): Promise<{ conversationId: string; messageId: string }> {
    this.ensureChannels(input.orgId);
    const conn = this.db
      .prepare(
        `select * from channel_connections where org_id=? and channel=?`,
      )
      .get(input.orgId, input.channel) as Record<string, unknown> | undefined;
    if (!conn?.webhook_secret) {
      throw new AuthError("Channel not configured", "not_found");
    }
    const verified = verifyMessagingWebhook({
      secret: String(conn.webhook_secret),
      timestamp: input.timestamp,
      rawBody: input.rawBody,
      signature: input.signature,
    });
    if (!verified.ok) {
      throw new AuthError(verified.reason, "unauthorized");
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      throw new AuthError("Invalid JSON", "validation");
    }
    const from = String(body.from ?? body.sender ?? "unknown");
    const text = String(body.text ?? body.body ?? "");
    let conv = this.db
      .prepare(
        `select * from conversations where org_id=? and channel=? and contact_address=? order by created_at desc limit 1`,
      )
      .get(input.orgId, input.channel, from) as
      | Record<string, unknown>
      | undefined;
    if (!conv) {
      const id = randomUUID();
      const now = nowIso();
      this.db
        .prepare(
          `insert into conversations(
            id, org_id, channel, subject, status, assignee_user_id, lead_id, contact_address,
            unread_count, tags, sla_due_at, last_message_at, consent_ok, opted_out, created_at, updated_at
          ) values (?,?,?,?,'open',null,null,?,1,'[]',null,?,1,0,?,?)`,
        )
        .run(
          id,
          input.orgId,
          input.channel,
          `Inbound ${input.channel}`,
          from,
          now,
          now,
          now,
        );
      conv = this.db
        .prepare(`select * from conversations where id=?`)
        .get(id) as Record<string, unknown>;
    }
    const messageId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into inbox_messages(
          id, org_id, conversation_id, direction, channel, body, html_body, template_key,
          attachment_paths, delivery_status, provider_message_id, sender_user_id, is_internal_note, error, created_at
        ) values (?,?,?,'inbound',?,?,null,null,'[]','delivered',?,?,0,null,?)`,
      )
      .run(
        messageId,
        input.orgId,
        String(conv.id),
        input.channel,
        text,
        body.id ? String(body.id) : null,
        null,
        now,
      );
    this.db
      .prepare(
        `update conversations set unread_count=unread_count+1, last_message_at=?, updated_at=? where id=?`,
      )
      .run(now, now, String(conv.id));
    return { conversationId: String(conv.id), messageId };
  }
}
