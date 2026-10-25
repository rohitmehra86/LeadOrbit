import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  applyOutboundDeliveryAttempt,
  buildOutboundWebhookEnvelope,
  hasPermission,
  isPartnerEventType,
  normalizeEventTypes,
  postSignedOutboundWebhook,
  validateOutboundTargetUrl,
  type InboundPartnerEvent,
  type OutboundWebhookDelivery,
  type OutboundWebhookSubscription,
  type PartnerEventType,
} from "@leadorbit/domain";
import {
  signWebhookPayload,
  verifyWebhookSignature,
} from "@leadorbit/domain/server";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import { SqliteJobQueue, type DurableJobQueue } from "./job-queue";

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

/**
 * Zapier/n8n-style outbound subscriptions + inbound partner webhooks.
 * Delivered only after verified HTTP 2xx; inbound requires signature + idempotency.
 */
export class PartnerWebhookStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private queue: DurableJobQueue = new SqliteJobQueue(db),
  ) {}

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "integrations:read" | "integrations:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  private mapSub(row: Record<string, unknown>): OutboundWebhookSubscription {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      name: String(row.name),
      targetUrl: String(row.target_url),
      secret: String(row.secret),
      eventTypes: jparse(String(row.event_types), []) as PartnerEventType[],
      enabled: Boolean(row.enabled),
      description: row.description ? String(row.description) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapDelivery(row: Record<string, unknown>): OutboundWebhookDelivery {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      subscriptionId: String(row.subscription_id),
      eventType: row.event_type as PartnerEventType,
      eventId: String(row.event_id),
      status: row.status as OutboundWebhookDelivery["status"],
      attemptCount: Number(row.attempt_count),
      nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
      lastStatusCode:
        row.last_status_code == null ? null : Number(row.last_status_code),
      lastError: row.last_error ? String(row.last_error) : null,
      payload: jparse(String(row.payload), {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listSubscriptions(
    actor: SessionUser,
    orgId: string,
  ): Promise<OutboundWebhookSubscription[]> {
    await this.gate(actor, orgId, "integrations:read");
    const rows = this.db
      .prepare(
        `select * from partner_outbound_subscriptions where org_id=? order by created_at desc`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapSub(r));
  }

  async createSubscription(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      targetUrl: string;
      eventTypes?: string[];
      description?: string | null;
    },
  ): Promise<OutboundWebhookSubscription> {
    await this.gate(actor, orgId, "integrations:write");
    const urlCheck = validateOutboundTargetUrl(input.targetUrl);
    if (!urlCheck.ok) throw new AuthError(urlCheck.detail, "validation");
    const id = randomUUID();
    const now = nowIso();
    const secret = `pwhsec_${randomBytes(24).toString("hex")}`;
    const eventTypes = normalizeEventTypes(input.eventTypes);
    this.db
      .prepare(
        `insert into partner_outbound_subscriptions(
          id, org_id, name, target_url, secret, event_types, enabled, description, created_at, updated_at
        ) values (?,?,?,?,?,?,1,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name.trim() || "Partner webhook",
        urlCheck.url,
        secret,
        JSON.stringify(eventTypes),
        input.description ?? null,
        now,
        now,
      );
    return this.mapSub(
      this.db
        .prepare(`select * from partner_outbound_subscriptions where id=?`)
        .get(id) as Record<string, unknown>,
    );
  }

  async setSubscriptionEnabled(
    actor: SessionUser,
    orgId: string,
    subscriptionId: string,
    enabled: boolean,
  ): Promise<OutboundWebhookSubscription> {
    await this.gate(actor, orgId, "integrations:write");
    const now = nowIso();
    const updated = this.db
      .prepare(
        `update partner_outbound_subscriptions set enabled=?, updated_at=?
         where org_id=? and id=?`,
      )
      .run(enabled ? 1 : 0, now, orgId, subscriptionId) as { changes: number };
    if (!updated.changes) throw new AuthError("Subscription not found", "not_found");
    return this.mapSub(
      this.db
        .prepare(`select * from partner_outbound_subscriptions where id=?`)
        .get(subscriptionId) as Record<string, unknown>,
    );
  }

  async listDeliveries(
    actor: SessionUser,
    orgId: string,
  ): Promise<OutboundWebhookDelivery[]> {
    await this.gate(actor, orgId, "integrations:read");
    const rows = this.db
      .prepare(
        `select * from partner_outbound_deliveries where org_id=?
         order by created_at desc limit 100`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapDelivery(r));
  }

  /**
   * Emit an event to matching subscriptions. Idempotent per (subscription, eventId).
   * Enqueues durable delivery jobs — does not claim success without HTTP 2xx.
   */
  async emitEvent(
    orgId: string,
    input: {
      eventType: PartnerEventType;
      eventId?: string;
      data: Record<string, unknown>;
      subscriptionId?: string;
    },
  ): Promise<{ enqueued: number; deliveries: OutboundWebhookDelivery[] }> {
    if (!isPartnerEventType(input.eventType)) {
      throw new AuthError("Unknown partner event type", "validation");
    }
    const eventId = input.eventId ?? randomUUID();
    const envelope = buildOutboundWebhookEnvelope({
      orgId,
      eventType: input.eventType,
      eventId,
      data: input.data,
    });
    const subs = this.db
      .prepare(
        `select * from partner_outbound_subscriptions where org_id=? and enabled=1`,
      )
      .all(orgId) as Record<string, unknown>[];
    const deliveries: OutboundWebhookDelivery[] = [];
    for (const row of subs) {
      const sub = this.mapSub(row);
      if (input.subscriptionId && sub.id !== input.subscriptionId) continue;
      if (!sub.eventTypes.includes(input.eventType)) continue;
      const deliveryId = randomUUID();
      const now = nowIso();
      try {
        this.db
          .prepare(
            `insert into partner_outbound_deliveries(
              id, org_id, subscription_id, event_type, event_id, status, attempt_count,
              next_retry_at, last_status_code, last_error, payload, created_at, updated_at
            ) values (?,?,?,?,?,'pending',0,null,null,null,?,?,?)`,
          )
          .run(
            deliveryId,
            orgId,
            sub.id,
            input.eventType,
            eventId,
            JSON.stringify(envelope),
            now,
            now,
          );
      } catch {
        // Unique (org, subscription, event_id) — idempotent skip
        continue;
      }
      await this.queue.enqueue(
        "partner.webhook.deliver",
        { orgId, deliveryId },
        { idempotencyKey: `partner-deliver:${deliveryId}` },
      );
      deliveries.push(
        this.mapDelivery(
          this.db
            .prepare(`select * from partner_outbound_deliveries where id=?`)
            .get(deliveryId) as Record<string, unknown>,
        ),
      );
    }
    return { enqueued: deliveries.length, deliveries };
  }

  async emitTestEvent(
    actor: SessionUser,
    orgId: string,
    subscriptionId?: string,
    fetchImpl?: typeof fetch,
  ): Promise<{ enqueued: number; deliveries: OutboundWebhookDelivery[] }> {
    await this.gate(actor, orgId, "integrations:write");
    if (subscriptionId) {
      const row = this.db
        .prepare(
          `select * from partner_outbound_subscriptions where org_id=? and id=?`,
        )
        .get(orgId, subscriptionId) as Record<string, unknown> | undefined;
      if (!row) throw new AuthError("Subscription not found", "not_found");
    }
    const result = await this.emitEvent(orgId, {
      eventType: "partner.test",
      subscriptionId,
      data: {
        source: "developers_console",
        subscriptionId: subscriptionId ?? null,
        actorUserId: actor.id,
      },
    });
    // First attempt immediately so local demos don't require a worker tick;
    // retries still go through the durable queue inside processDelivery.
    const deliveries: OutboundWebhookDelivery[] = [];
    for (const d of result.deliveries) {
      deliveries.push(await this.processDelivery(orgId, d.id, fetchImpl));
    }
    return { enqueued: result.enqueued, deliveries };
  }

  /** Worker: attempt signed HTTP delivery with retries. */
  async processDelivery(
    orgId: string,
    deliveryId: string,
    fetchImpl?: typeof fetch,
  ): Promise<OutboundWebhookDelivery> {
    const row = this.db
      .prepare(
        `select * from partner_outbound_deliveries where org_id=? and id=?`,
      )
      .get(orgId, deliveryId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Delivery not found", "not_found");
    const delivery = this.mapDelivery(row);
    if (delivery.status === "delivered" || delivery.status === "dead_letter") {
      return delivery;
    }
    const subRow = this.db
      .prepare(`select * from partner_outbound_subscriptions where id=?`)
      .get(delivery.subscriptionId) as Record<string, unknown> | undefined;
    if (!subRow || !Boolean(subRow.enabled)) {
      const now = nowIso();
      this.db
        .prepare(
          `update partner_outbound_deliveries set status='dead_letter',
           last_error=?, updated_at=? where id=?`,
        )
        .run("Subscription missing or disabled", now, deliveryId);
      return this.mapDelivery(
        this.db
          .prepare(`select * from partner_outbound_deliveries where id=?`)
          .get(deliveryId) as Record<string, unknown>,
      );
    }
    const sub = this.mapSub(subRow);
    const rawBody = JSON.stringify(delivery.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWebhookPayload(sub.secret, timestamp, rawBody);
    const result = await postSignedOutboundWebhook({
      targetUrl: sub.targetUrl,
      rawBody,
      signature,
      timestamp,
      fetchImpl,
    });
    const advanced = applyOutboundDeliveryAttempt(
      delivery.attemptCount,
      result.ok,
    );
    const now = nowIso();
    this.db
      .prepare(
        `update partner_outbound_deliveries set status=?, attempt_count=?,
         next_retry_at=?, last_status_code=?, last_error=?, updated_at=? where id=?`,
      )
      .run(
        advanced.status,
        advanced.attemptCount,
        advanced.nextRetryAt,
        result.statusCode,
        result.ok ? null : result.detail,
        now,
        deliveryId,
      );

    if (advanced.status === "retrying" && advanced.retryDelayMs != null) {
      await this.queue.enqueue(
        "partner.webhook.deliver",
        { orgId, deliveryId },
        {
          idempotencyKey: `partner-deliver:${deliveryId}:a${advanced.attemptCount}`,
          delayMs: advanced.retryDelayMs,
        },
      );
    }

    return this.mapDelivery(
      this.db
        .prepare(`select * from partner_outbound_deliveries where id=?`)
        .get(deliveryId) as Record<string, unknown>,
    );
  }

  /** Ensure inbound signing secret for the org (returned once on rotate). */
  async ensureInboundSecret(
    actor: SessionUser,
    orgId: string,
    rotate = false,
  ): Promise<{ secret: string; rotated: boolean }> {
    await this.gate(actor, orgId, "integrations:write");
    const existing = this.db
      .prepare(`select secret from partner_inbound_secrets where org_id=?`)
      .get(orgId) as { secret: string } | undefined;
    if (existing && !rotate) {
      return { secret: existing.secret, rotated: false };
    }
    const secret = `piwhsec_${randomBytes(24).toString("hex")}`;
    const now = nowIso();
    this.db
      .prepare(
        `insert into partner_inbound_secrets(org_id, secret, updated_at) values (?,?,?)
         on conflict(org_id) do update set secret=excluded.secret, updated_at=excluded.updated_at`,
      )
      .run(orgId, secret, now);
    return { secret, rotated: Boolean(existing) };
  }

  getInboundSecret(orgId: string): string | null {
    const row = this.db
      .prepare(`select secret from partner_inbound_secrets where org_id=?`)
      .get(orgId) as { secret: string } | undefined;
    return row?.secret ?? null;
  }

  /**
   * Inbound partner webhook — verify signature, idempotent by (partner, event_id).
   * Never invents processing success for unknown partners beyond accept+store.
   */
  processInboundWebhook(input: {
    orgId: string;
    partner: string;
    eventId: string;
    eventType: string;
    rawBody: string;
    timestamp: string;
    signature: string;
  }): {
    accepted: boolean;
    duplicate: boolean;
    event: InboundPartnerEvent | null;
    detail: string;
  } {
    const secret = this.getInboundSecret(input.orgId);
    if (!secret) {
      return {
        accepted: false,
        duplicate: false,
        event: null,
        detail: "Inbound partner secret not configured for org",
      };
    }
    const verified = verifyWebhookSignature({
      secret,
      timestamp: input.timestamp,
      rawBody: input.rawBody,
      signature: input.signature,
    });
    if (!verified.ok) {
      return {
        accepted: false,
        duplicate: false,
        event: null,
        detail: verified.reason,
      };
    }

    const existing = this.db
      .prepare(
        `select * from partner_inbound_events where org_id=? and partner=? and event_id=?`,
      )
      .get(input.orgId, input.partner, input.eventId) as
      | Record<string, unknown>
      | undefined;
    if (existing) {
      return {
        accepted: true,
        duplicate: true,
        event: this.mapInbound(existing),
        detail: "Duplicate event_id (idempotent)",
      };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      payload = { raw: input.rawBody };
    }

    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into partner_inbound_events(
          id, org_id, partner, event_id, event_type, status, detail, payload, created_at
        ) values (?,?,?,?,?,'accepted','ok',?,?)`,
      )
      .run(
        id,
        input.orgId,
        input.partner.trim().slice(0, 64) || "partner",
        input.eventId,
        input.eventType,
        JSON.stringify(payload),
        now,
      );

    return {
      accepted: true,
      duplicate: false,
      event: this.mapInbound(
        this.db
          .prepare(`select * from partner_inbound_events where id=?`)
          .get(id) as Record<string, unknown>,
      ),
      detail: "ok",
    };
  }

  async listInboundEvents(
    actor: SessionUser,
    orgId: string,
  ): Promise<InboundPartnerEvent[]> {
    await this.gate(actor, orgId, "integrations:read");
    const rows = this.db
      .prepare(
        `select * from partner_inbound_events where org_id=?
         order by created_at desc limit 100`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapInbound(r));
  }

  private mapInbound(row: Record<string, unknown>): InboundPartnerEvent {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      partner: String(row.partner),
      eventId: String(row.event_id),
      eventType: String(row.event_type),
      status: row.status as InboundPartnerEvent["status"],
      detail: String(row.detail),
      payload: jparse(String(row.payload), {}),
      createdAt: String(row.created_at),
    };
  }
}
