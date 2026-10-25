import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  attemptInboundAccept,
  attemptOutboundCall,
  classifyCallOutcomeScaffold,
  estimateCallCostUsd,
  hasPermission,
  scaffoldCallTranscription,
  authorizeVoiceProvider,
  type CallDirection,
  type CallOutcome,
  type VoiceAnalytics,
  type VoiceCall,
  type VoiceConnection,
  type VoiceProvider,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import { SqliteJobQueue, type DurableJobQueue } from "./job-queue";
import type { CalendarStore } from "./calendar-store";

function nowIso(): string {
  return new Date().toISOString();
}

export class VoiceStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private queue: DurableJobQueue = new SqliteJobQueue(db),
    private calendar: CalendarStore | null = null,
  ) {}

  setCalendarStore(calendar: CalendarStore): void {
    this.calendar = calendar;
  }

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "voice:read" | "voice:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  ensureConnections(orgId: string): VoiceConnection[] {
    const now = nowIso();
    for (const provider of ["twilio", "vonage", "custom"] as VoiceProvider[]) {
      const auth = authorizeVoiceProvider(provider);
      this.db
        .prepare(
          `insert into voice_connections(id, org_id, provider, status, from_number, detail, created_at, updated_at)
           values (?,?,?,?,null,?,?,?)
           on conflict(org_id, provider) do update set status=excluded.status, detail=excluded.detail, updated_at=excluded.updated_at`,
        )
        .run(randomUUID(), orgId, provider, auth.status, auth.detail, now, now);
    }
    this.db
      .prepare(
        `insert into org_voice_policies(org_id, legal_outbound_allowed, require_recording_consent, updated_at)
         values (?,0,1,?)
         on conflict(org_id) do nothing`,
      )
      .run(orgId, now);
    return this.listConnectionsInternal(orgId);
  }

  private listConnectionsInternal(orgId: string): VoiceConnection[] {
    const rows = this.db
      .prepare(`select * from voice_connections where org_id=? order by provider`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      provider: r.provider as VoiceProvider,
      status: r.status as VoiceConnection["status"],
      fromNumber: r.from_number ? String(r.from_number) : null,
      detail: String(r.detail),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async listConnections(actor: SessionUser, orgId: string): Promise<VoiceConnection[]> {
    await this.gate(actor, orgId, "voice:read");
    return this.ensureConnections(orgId);
  }

  async updatePolicy(
    actor: SessionUser,
    orgId: string,
    input: { legalOutboundAllowed?: boolean; requireRecordingConsent?: boolean },
  ): Promise<{
    legalOutboundAllowed: boolean;
    requireRecordingConsent: boolean;
  }> {
    await this.gate(actor, orgId, "voice:write");
    this.ensureConnections(orgId);
    const current = this.db
      .prepare(`select * from org_voice_policies where org_id=?`)
      .get(orgId) as Record<string, unknown>;
    const legal =
      input.legalOutboundAllowed == null
        ? Boolean(current.legal_outbound_allowed)
        : input.legalOutboundAllowed;
    const consent =
      input.requireRecordingConsent == null
        ? Boolean(current.require_recording_consent)
        : input.requireRecordingConsent;
    this.db
      .prepare(
        `update org_voice_policies set legal_outbound_allowed=?, require_recording_consent=?, updated_at=? where org_id=?`,
      )
      .run(legal ? 1 : 0, consent ? 1 : 0, nowIso(), orgId);
    return { legalOutboundAllowed: legal, requireRecordingConsent: consent };
  }

  async getPolicy(
    actor: SessionUser,
    orgId: string,
  ): Promise<{ legalOutboundAllowed: boolean; requireRecordingConsent: boolean }> {
    await this.gate(actor, orgId, "voice:read");
    this.ensureConnections(orgId);
    const row = this.db
      .prepare(`select * from org_voice_policies where org_id=?`)
      .get(orgId) as Record<string, unknown>;
    return {
      legalOutboundAllowed: Boolean(row.legal_outbound_allowed),
      requireRecordingConsent: Boolean(row.require_recording_consent),
    };
  }

  private mapCall(r: Record<string, unknown>): VoiceCall {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      provider: r.provider as VoiceProvider,
      direction: r.direction as CallDirection,
      status: r.status as VoiceCall["status"],
      fromNumber: String(r.from_number),
      toNumber: String(r.to_number),
      leadId: r.lead_id ? String(r.lead_id) : null,
      assigneeUserId: r.assignee_user_id ? String(r.assignee_user_id) : null,
      appointmentId: r.appointment_id ? String(r.appointment_id) : null,
      recordingConsent: Boolean(r.recording_consent),
      recordingUrl: r.recording_url ? String(r.recording_url) : null,
      transcriptStatus: r.transcript_status as VoiceCall["transcriptStatus"],
      transcriptText: r.transcript_text ? String(r.transcript_text) : null,
      summary: r.summary ? String(r.summary) : null,
      outcome: r.outcome as CallOutcome,
      aiAssisted: Boolean(r.ai_assisted),
      durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
      costUsd: r.cost_usd == null ? null : Number(r.cost_usd),
      legalOutboundAllowed: Boolean(r.legal_outbound_allowed),
      detail: r.detail ? String(r.detail) : null,
      startedAt: r.started_at ? String(r.started_at) : null,
      endedAt: r.ended_at ? String(r.ended_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async startOutboundCall(
    actor: SessionUser,
    orgId: string,
    input: {
      provider?: VoiceProvider;
      toNumber: string;
      fromNumber?: string;
      leadId?: string | null;
      recordingConsent: boolean;
      aiAssisted?: boolean;
    },
  ): Promise<VoiceCall> {
    await this.gate(actor, orgId, "voice:write");
    const policy = await this.getPolicy(actor, orgId);
    const provider = input.provider ?? "twilio";
    this.ensureConnections(orgId);
    const attempt = attemptOutboundCall({
      provider,
      legalOutboundAllowed: policy.legalOutboundAllowed,
      recordingConsent: input.recordingConsent,
    });
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into voice_calls(
          id, org_id, provider, direction, status, from_number, to_number, lead_id, assignee_user_id,
          appointment_id, recording_consent, recording_url, transcript_status, transcript_text, summary,
          outcome, ai_assisted, duration_seconds, cost_usd, legal_outbound_allowed, detail,
          started_at, ended_at, created_at, updated_at
        ) values (?,?,?,'outbound',?,?,?,?,?,null,?,null,'pending',null,null,'unknown',?,null,null,?,?,null,null,?,?)`,
      )
      .run(
        id,
        orgId,
        provider,
        attempt.status,
        input.fromNumber ?? "pending",
        input.toNumber,
        input.leadId ?? null,
        actor.id,
        input.recordingConsent ? 1 : 0,
        input.aiAssisted ? 1 : 0,
        policy.legalOutboundAllowed ? 1 : 0,
        attempt.detail,
        now,
        now,
      );
    await this.queue.enqueue(
      "voice.process",
      { orgId, callId: id },
      { idempotencyKey: `voice-process:${id}` },
    );
    return this.mapCall(
      this.db.prepare(`select * from voice_calls where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  async acceptInboundCall(
    actor: SessionUser,
    orgId: string,
    input: {
      provider?: VoiceProvider;
      fromNumber: string;
      toNumber: string;
      leadId?: string | null;
      recordingConsent?: boolean;
      aiAssisted?: boolean;
    },
  ): Promise<VoiceCall> {
    await this.gate(actor, orgId, "voice:write");
    const provider = input.provider ?? "twilio";
    this.ensureConnections(orgId);
    const attempt = attemptInboundAccept(provider);
    const now = nowIso();
    const id = randomUUID();
    const consent = input.recordingConsent ?? false;
    this.db
      .prepare(
        `insert into voice_calls(
          id, org_id, provider, direction, status, from_number, to_number, lead_id, assignee_user_id,
          appointment_id, recording_consent, recording_url, transcript_status, transcript_text, summary,
          outcome, ai_assisted, duration_seconds, cost_usd, legal_outbound_allowed, detail,
          started_at, ended_at, created_at, updated_at
        ) values (?,?,?,'inbound',?,?,?,?,?,null,?,null,'pending',null,null,'unknown',?,null,null,0,?,?,null,?,?)`,
      )
      .run(
        id,
        orgId,
        provider,
        attempt.status,
        input.fromNumber,
        input.toNumber,
        input.leadId ?? null,
        actor.id,
        consent ? 1 : 0,
        input.aiAssisted ? 1 : 0,
        attempt.detail,
        now,
        now,
        now,
      );
    await this.queue.enqueue(
      "voice.process",
      { orgId, callId: id },
      { idempotencyKey: `voice-process:${id}` },
    );
    return this.mapCall(
      this.db.prepare(`select * from voice_calls where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  async transferToHuman(
    actor: SessionUser,
    orgId: string,
    callId: string,
    assigneeUserId: string,
  ): Promise<VoiceCall> {
    await this.gate(actor, orgId, "voice:write");
    const row = this.db
      .prepare(`select * from voice_calls where org_id=? and id=?`)
      .get(orgId, callId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Call not found", "not_found");
    this.db
      .prepare(
        `update voice_calls set status='transferred', assignee_user_id=?, outcome='transferred_human',
         detail=?, updated_at=? where id=?`,
      )
      .run(
        assigneeUserId,
        `Transferred to human ${assigneeUserId}`,
        nowIso(),
        callId,
      );
    return this.mapCall(
      this.db.prepare(`select * from voice_calls where id=?`).get(callId) as Record<
        string,
        unknown
      >,
    );
  }

  async bookAppointmentFromCall(
    actor: SessionUser,
    orgId: string,
    callId: string,
    input: {
      appointmentTypeId: string;
      startsAt: string;
      siteVisitAddress?: string | null;
    },
  ): Promise<{ call: VoiceCall; appointmentId: string }> {
    await this.gate(actor, orgId, "voice:write");
    if (!this.calendar) {
      throw new AuthError("Calendar store not configured", "validation");
    }
    const row = this.db
      .prepare(`select * from voice_calls where org_id=? and id=?`)
      .get(orgId, callId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Call not found", "not_found");
    const call = this.mapCall(row);
    const appt = await this.calendar.bookAppointment(actor, orgId, {
      appointmentTypeId: input.appointmentTypeId,
      leadId: call.leadId,
      assigneeUserId: call.assigneeUserId ?? actor.id,
      startsAt: input.startsAt,
      siteVisitAddress: input.siteVisitAddress,
      title: "Appointment from call",
      notes: `Booked from call ${callId}`,
    });
    this.db
      .prepare(
        `update voice_calls set appointment_id=?, outcome='appointment_booked', updated_at=? where id=?`,
      )
      .run(appt.id, nowIso(), callId);
    return {
      call: this.mapCall(
        this.db.prepare(`select * from voice_calls where id=?`).get(callId) as Record<
          string,
          unknown
        >,
      ),
      appointmentId: appt.id,
    };
  }

  /** Worker: scaffold transcription/summary/outcome — never fakes live STT. */
  processCall(orgId: string, callId: string): void {
    const row = this.db
      .prepare(`select * from voice_calls where org_id=? and id=?`)
      .get(orgId, callId) as Record<string, unknown> | undefined;
    if (!row) return;
    const call = this.mapCall(row);
    const tx = scaffoldCallTranscription({
      hasRecording: Boolean(call.recordingUrl),
      recordingConsent: call.recordingConsent,
    });
    const outcome = classifyCallOutcomeScaffold({
      textHints: call.detail ?? "",
      transferred: call.status === "transferred",
      appointmentBooked: Boolean(call.appointmentId),
    });
    const cost = estimateCallCostUsd(call.durationSeconds);
    this.db
      .prepare(
        `update voice_calls set transcript_status=?, transcript_text=?, summary=?, outcome=?,
         cost_usd=?, detail=?, updated_at=? where id=?`,
      )
      .run(
        tx.transcriptStatus,
        tx.transcriptText,
        tx.summary ??
          (call.aiAssisted
            ? "AI-assisted qualification scaffold — LLM/STT not verified"
            : null),
        call.appointmentId ? "appointment_booked" : outcome,
        cost,
        tx.detail,
        nowIso(),
        callId,
      );
  }

  async listCalls(actor: SessionUser, orgId: string): Promise<VoiceCall[]> {
    await this.gate(actor, orgId, "voice:read");
    const rows = this.db
      .prepare(
        `select * from voice_calls where org_id=? order by created_at desc limit 200`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapCall(r));
  }

  async analytics(actor: SessionUser, orgId: string): Promise<VoiceAnalytics> {
    await this.gate(actor, orgId, "voice:read");
    const calls = await this.listCalls(actor, orgId);
    const completed = calls.filter((c) => c.status === "completed").length;
    const durations = calls
      .map((c) => c.durationSeconds)
      .filter((d): d is number => d != null);
    return {
      totalCalls: calls.length,
      inbound: calls.filter((c) => c.direction === "inbound").length,
      outbound: calls.filter((c) => c.direction === "outbound").length,
      completed,
      pendingConfiguration: calls.filter(
        (c) => c.status === "pending_configuration",
      ).length,
      transferred: calls.filter((c) => c.status === "transferred").length,
      appointmentsBooked: calls.filter((c) => c.outcome === "appointment_booked")
        .length,
      totalCostUsd: Number(
        calls.reduce((s, c) => s + (c.costUsd ?? 0), 0).toFixed(4),
      ),
      avgDurationSeconds:
        durations.length === 0
          ? null
          : Math.round(
              durations.reduce((a, b) => a + b, 0) / durations.length,
            ),
    };
  }
}
