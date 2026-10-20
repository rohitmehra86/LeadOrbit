import { AuthError, type SessionUser } from "@leadorbit/db";
import {
  messagingProviderCredentialsPresent,
  type ChannelConnection,
  type Conversation,
  type ConversationStatus,
  type InboxChannel,
  type InboxMessage,
  type MessageTemplate,
  type OptOutRecord,
  type ProviderConnectionStatus,
} from "@leadorbit/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    channel: row.channel as InboxChannel,
    subject: (row.subject as string | null) ?? null,
    status: row.status as ConversationStatus,
    assigneeUserId: (row.assignee_user_id as string | null) ?? null,
    leadId: (row.lead_id as string | null) ?? null,
    contactAddress: (row.contact_address as string | null) ?? null,
    unreadCount: Number(row.unread_count ?? 0),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    slaDueAt: (row.sla_due_at as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    consentOk: row.consent_ok !== false,
    optedOut: Boolean(row.opted_out),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMessage(row: Record<string, unknown>): InboxMessage {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    conversationId: String(row.conversation_id),
    direction: row.direction as InboxMessage["direction"],
    channel: row.channel as InboxChannel,
    body: String(row.body),
    htmlBody: (row.html_body as string | null) ?? null,
    templateKey: (row.template_key as string | null) ?? null,
    attachmentPaths: Array.isArray(row.attachment_paths)
      ? (row.attachment_paths as string[])
      : [],
    deliveryStatus: row.delivery_status as InboxMessage["deliveryStatus"],
    providerMessageId: (row.provider_message_id as string | null) ?? null,
    senderUserId: (row.sender_user_id as string | null) ?? null,
    isInternalNote: Boolean(row.is_internal_note),
    error: (row.error as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

/** Durable inbox for AUTH_MODE=supabase. Outbound send stays blocked without provider keys. */
export class SupabaseInboxStore {
  async listConversations(
    _actor: SessionUser,
    orgId: string,
    opts?: { q?: string; status?: string; channel?: string },
  ): Promise<Conversation[]> {
    const supabase = await client();
    let q = supabase
      .from("conversations")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (opts?.status) q = q.eq("status", opts.status);
    if (opts?.channel) q = q.eq("channel", opts.channel);
    const { data, error } = await q;
    if (error) throw new AuthError(error.message, "validation");
    let rows = ((data ?? []) as Array<Record<string, unknown>>).map(mapConversation);
    if (opts?.q) {
      const needle = opts.q.toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.subject ?? "").toLowerCase().includes(needle) ||
          (c.contactAddress ?? "").toLowerCase().includes(needle) ||
          c.tags.some((t) => t.toLowerCase().includes(needle)),
      );
    }
    return rows;
  }

  async createConversation(
    _actor: SessionUser,
    orgId: string,
    input: {
      channel: InboxChannel;
      subject?: string;
      contactAddress?: string;
      leadId?: string | null;
      slaHours?: number;
    },
  ): Promise<Conversation> {
    const supabase = await client();
    const slaDueAt = input.slaHours
      ? new Date(Date.now() + input.slaHours * 3600_000).toISOString()
      : null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        org_id: orgId,
        channel: input.channel,
        subject: input.subject ?? null,
        status: "open",
        lead_id: input.leadId ?? null,
        contact_address: input.contactAddress ?? null,
        unread_count: 0,
        tags: [],
        sla_due_at: slaDueAt,
        consent_ok: true,
        opted_out: false,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapConversation(data as Record<string, unknown>);
  }

  async updateConversation(
    _actor: SessionUser,
    orgId: string,
    conversationId: string,
    patch: Partial<{
      status: ConversationStatus;
      assigneeUserId: string | null;
      tags: string[];
      unreadCount: number;
    }>,
  ): Promise<Conversation> {
    const supabase = await client();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.assigneeUserId !== undefined) updates.assignee_user_id = patch.assigneeUserId;
    if (patch.tags !== undefined) updates.tags = patch.tags;
    if (patch.unreadCount !== undefined) updates.unread_count = patch.unreadCount;
    const { data, error } = await supabase
      .from("conversations")
      .update(updates)
      .eq("org_id", orgId)
      .eq("id", conversationId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapConversation(data as Record<string, unknown>);
  }

  async listMessages(
    _actor: SessionUser,
    orgId: string,
    conversationId: string,
  ): Promise<InboxMessage[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapMessage);
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
    const supabase = await client();
    const { data: convRow, error: convErr } = await supabase
      .from("conversations")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", input.conversationId)
      .maybeSingle();
    if (convErr) throw new AuthError(convErr.message, "validation");
    if (!convRow) throw new AuthError("Conversation not found", "not_found");
    const conversation = mapConversation(convRow as Record<string, unknown>);

    if (input.isInternalNote) {
      const { data, error } = await supabase
        .from("inbox_messages")
        .insert({
          org_id: orgId,
          conversation_id: conversation.id,
          direction: "internal",
          channel: conversation.channel,
          body: input.body,
          attachment_paths: input.attachmentPaths ?? [],
          delivery_status: "delivered",
          sender_user_id: actor.id,
          is_internal_note: true,
        })
        .select("*")
        .single();
      if (error) throw new AuthError(error.message, "validation");
      return { message: mapMessage(data as Record<string, unknown>), jobId: null };
    }

    if (conversation.optedOut) {
      throw new AuthError("Contact opted out of this channel", "conflict");
    }

    const configured = messagingProviderCredentialsPresent(conversation.channel);
    const deliveryStatus = configured ? "queued" : "pending_configuration";
    const errMsg = configured
      ? null
      : `Outbound ${conversation.channel} blocked: provider credentials not configured (no fake success)`;

    const { data, error } = await supabase
      .from("inbox_messages")
      .insert({
        org_id: orgId,
        conversation_id: conversation.id,
        direction: "outbound",
        channel: conversation.channel,
        body: input.body,
        template_key: input.templateKey ?? null,
        attachment_paths: input.attachmentPaths ?? [],
        delivery_status: deliveryStatus,
        sender_user_id: actor.id,
        is_internal_note: false,
        error: errMsg,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");

    const now = new Date().toISOString();
    await supabase
      .from("conversations")
      .update({ last_message_at: now, updated_at: now })
      .eq("id", conversation.id);

    // Durable job queue for message.send is Wave 4+ when worker uses Postgres jobs.
    void input.scheduleAt;
    return {
      message: mapMessage(data as Record<string, unknown>),
      jobId: configured ? null : null,
    };
  }

  async listTemplates(_actor: SessionUser, orgId: string): Promise<MessageTemplate[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("message_templates")
      .select("*")
      .eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
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
    _actor: SessionUser,
    orgId: string,
    input: { channel: InboxChannel; key: string; name: string; body: string },
  ): Promise<MessageTemplate> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("message_templates")
      .insert({
        org_id: orgId,
        channel: input.channel,
        key: input.key,
        name: input.name,
        body: input.body,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as InboxChannel,
      key: String(r.key),
      name: String(r.name),
      body: String(r.body),
      createdAt: String(r.created_at),
    };
  }

  async listChannelConnections(
    _actor: SessionUser,
    orgId: string,
  ): Promise<ChannelConnection[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("channel_connections")
      .select("*")
      .eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as InboxChannel,
      status: r.status as ProviderConnectionStatus,
      webhookSecret: (r.webhook_secret as string | null) ?? null,
      config: (r.config as Record<string, unknown>) ?? {},
      lastError: (r.last_error as string | null) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async authorizeChannel(
    _actor: SessionUser,
    _orgId: string,
    _channel: InboxChannel,
  ): Promise<never> {
    throw new AuthError(
      "Channel OAuth/provider connect is blocked until WhatsApp/ESP credentials are configured",
      "validation",
    );
  }

  async addOptOut(
    _actor: SessionUser,
    orgId: string,
    channel: InboxChannel,
    address: string,
  ): Promise<OptOutRecord> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("opt_outs")
      .upsert(
        { org_id: orgId, channel, address: address.trim().toLowerCase() },
        { onConflict: "org_id,channel,address" },
      )
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as InboxChannel,
      address: String(r.address),
      createdAt: String(r.created_at),
    };
  }

  async processInboundWebhook(_input: unknown): Promise<never> {
    throw new AuthError(
      "Inbound messaging webhooks on Supabase require provider signatures (Wave 4)",
      "validation",
    );
  }
}

let singleton: SupabaseInboxStore | null = null;
export function getSupabaseInboxStore(): SupabaseInboxStore {
  if (!singleton) singleton = new SupabaseInboxStore();
  return singleton;
}
