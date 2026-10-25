import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  applyBuffers,
  appointmentReminderDeliveryStatus,
  authorizeCalendarProvider,
  computeEndIso,
  hasPermission,
  intervalsOverlap,
  type Appointment,
  type AppointmentKind,
  type AppointmentReminder,
  type AppointmentStatus,
  type AppointmentType,
  type BookingPage,
  type CalendarConnection,
  type CalendarProvider,
  type TeamAvailability,
} from "@leadorbit/domain";
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

const ACTIVE_STATUSES: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "rescheduled",
  "in_progress",
];

export class CalendarStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private queue: DurableJobQueue = new SqliteJobQueue(db),
  ) {}

  private async gate(
    actor: SessionUser | null,
    orgId: string,
    permission: "calendar:read" | "calendar:write" | "appointments:read" | "appointments:write",
  ): Promise<void> {
    if (!actor) return; // public booking path uses dedicated methods
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  ensureCalendarConnections(orgId: string): CalendarConnection[] {
    const now = nowIso();
    for (const provider of ["internal", "google", "microsoft"] as CalendarProvider[]) {
      const auth = authorizeCalendarProvider(provider);
      this.db
        .prepare(
          `insert into calendar_connections(id, org_id, provider, status, account_email, detail, created_at, updated_at)
           values (?,?,?,?,null,?,?,?)
           on conflict(org_id, provider) do update set status=excluded.status, detail=excluded.detail, updated_at=excluded.updated_at`,
        )
        .run(randomUUID(), orgId, provider, auth.status, auth.detail, now, now);
    }
    return this.listCalendarConnectionsInternal(orgId);
  }

  private listCalendarConnectionsInternal(orgId: string): CalendarConnection[] {
    const rows = this.db
      .prepare(`select * from calendar_connections where org_id=? order by provider`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      provider: r.provider as CalendarProvider,
      status: r.status as CalendarConnection["status"],
      accountEmail: r.account_email ? String(r.account_email) : null,
      detail: String(r.detail),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async listCalendarConnections(
    actor: SessionUser,
    orgId: string,
  ): Promise<CalendarConnection[]> {
    await this.gate(actor, orgId, "calendar:read");
    return this.ensureCalendarConnections(orgId);
  }

  private mapType(r: Record<string, unknown>): AppointmentType {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      kind: r.kind as AppointmentKind,
      durationMinutes: Number(r.duration_minutes),
      bufferBeforeMinutes: Number(r.buffer_before_minutes),
      bufferAfterMinutes: Number(r.buffer_after_minutes),
      timezone: String(r.timezone),
      requiresSiteVisit: Boolean(r.requires_site_visit),
      description: r.description ? String(r.description) : null,
      active: Boolean(r.active),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapAppointment(r: Record<string, unknown>): Appointment {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      appointmentTypeId: String(r.appointment_type_id),
      bookingPageId: r.booking_page_id ? String(r.booking_page_id) : null,
      leadId: r.lead_id ? String(r.lead_id) : null,
      assigneeUserId: r.assignee_user_id ? String(r.assignee_user_id) : null,
      status: r.status as AppointmentStatus,
      kind: r.kind as AppointmentKind,
      title: String(r.title),
      startsAt: String(r.starts_at),
      endsAt: String(r.ends_at),
      timezone: String(r.timezone),
      bufferBeforeMinutes: Number(r.buffer_before_minutes),
      bufferAfterMinutes: Number(r.buffer_after_minutes),
      location: r.location ? String(r.location) : null,
      siteVisitAddress: r.site_visit_address ? String(r.site_visit_address) : null,
      notes: r.notes ? String(r.notes) : null,
      reminderJobId: r.reminder_job_id ? String(r.reminder_job_id) : null,
      externalCalendarEventId: r.external_calendar_event_id
        ? String(r.external_calendar_event_id)
        : null,
      calendarProvider: r.calendar_provider
        ? (r.calendar_provider as CalendarProvider)
        : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async createAppointmentType(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      kind?: AppointmentKind;
      durationMinutes?: number;
      bufferBeforeMinutes?: number;
      bufferAfterMinutes?: number;
      timezone?: string;
      requiresSiteVisit?: boolean;
      description?: string | null;
    },
  ): Promise<AppointmentType> {
    await this.gate(actor, orgId, "calendar:write");
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into appointment_types(
          id, org_id, name, kind, duration_minutes, buffer_before_minutes, buffer_after_minutes,
          timezone, requires_site_visit, description, active, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        input.kind ?? "consultation",
        input.durationMinutes ?? 30,
        input.bufferBeforeMinutes ?? 0,
        input.bufferAfterMinutes ?? 0,
        input.timezone ?? "UTC",
        input.requiresSiteVisit ? 1 : 0,
        input.description ?? null,
        now,
        now,
      );
    return this.mapType(
      this.db.prepare(`select * from appointment_types where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  async listAppointmentTypes(
    actor: SessionUser,
    orgId: string,
  ): Promise<AppointmentType[]> {
    await this.gate(actor, orgId, "calendar:read");
    const rows = this.db
      .prepare(
        `select * from appointment_types where org_id=? and active=1 order by name`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapType(r));
  }

  async setAvailability(
    actor: SessionUser,
    orgId: string,
    input: {
      userId: string;
      windows: Array<{
        weekday: number;
        startTime: string;
        endTime: string;
        timezone?: string;
      }>;
    },
  ): Promise<TeamAvailability[]> {
    await this.gate(actor, orgId, "calendar:write");
    this.db
      .prepare(`delete from team_availability where org_id=? and user_id=?`)
      .run(orgId, input.userId);
    const now = nowIso();
    for (const w of input.windows) {
      this.db
        .prepare(
          `insert into team_availability(id, org_id, user_id, weekday, start_time, end_time, timezone, created_at)
           values (?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          orgId,
          input.userId,
          w.weekday,
          w.startTime,
          w.endTime,
          w.timezone ?? "UTC",
          now,
        );
    }
    return this.listAvailability(actor, orgId, input.userId);
  }

  async listAvailability(
    actor: SessionUser,
    orgId: string,
    userId?: string,
  ): Promise<TeamAvailability[]> {
    await this.gate(actor, orgId, "calendar:read");
    const rows = (
      userId
        ? this.db
            .prepare(
              `select * from team_availability where org_id=? and user_id=? order by weekday, start_time`,
            )
            .all(orgId, userId)
        : this.db
            .prepare(
              `select * from team_availability where org_id=? order by user_id, weekday`,
            )
            .all(orgId)
    ) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      userId: String(r.user_id),
      weekday: Number(r.weekday),
      startTime: String(r.start_time),
      endTime: String(r.end_time),
      timezone: String(r.timezone),
      createdAt: String(r.created_at),
    }));
  }

  async createBookingPage(
    actor: SessionUser,
    orgId: string,
    input: {
      slug: string;
      title: string;
      appointmentTypeId: string;
      timezone?: string;
      assignedUserIds?: string[];
      public?: boolean;
    },
  ): Promise<BookingPage> {
    await this.gate(actor, orgId, "calendar:write");
    const type = this.db
      .prepare(`select id from appointment_types where org_id=? and id=?`)
      .get(orgId, input.appointmentTypeId);
    if (!type) throw new AuthError("Appointment type not found", "not_found");
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into booking_pages(
          id, org_id, slug, title, appointment_type_id, timezone, assigned_user_ids, public, active, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,1,?,?)`,
      )
      .run(
        id,
        orgId,
        input.slug,
        input.title,
        input.appointmentTypeId,
        input.timezone ?? "UTC",
        JSON.stringify(input.assignedUserIds ?? []),
        input.public === false ? 0 : 1,
        now,
        now,
      );
    return this.mapBookingPage(
      this.db.prepare(`select * from booking_pages where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  private mapBookingPage(r: Record<string, unknown>): BookingPage {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      slug: String(r.slug),
      title: String(r.title),
      appointmentTypeId: String(r.appointment_type_id),
      timezone: String(r.timezone),
      assignedUserIds: jparse(String(r.assigned_user_ids), []),
      public: Boolean(r.public),
      active: Boolean(r.active),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listBookingPages(actor: SessionUser, orgId: string): Promise<BookingPage[]> {
    await this.gate(actor, orgId, "calendar:read");
    const rows = this.db
      .prepare(`select * from booking_pages where org_id=? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapBookingPage(r));
  }

  getPublicBookingPage(orgId: string, slug: string): BookingPage | null {
    const row = this.db
      .prepare(
        `select * from booking_pages where org_id=? and slug=? and public=1 and active=1`,
      )
      .get(orgId, slug) as Record<string, unknown> | undefined;
    return row ? this.mapBookingPage(row) : null;
  }

  /**
   * Find conflicting active appointments for an assignee (or org-wide if null)
   * using buffered intervals.
   */
  findConflicts(input: {
    orgId: string;
    assigneeUserId: string | null;
    blockedStart: Date;
    blockedEnd: Date;
    excludeAppointmentId?: string;
  }): Appointment[] {
    const rows = this.db
      .prepare(
        `select * from appointments
         where org_id=? and status in ('scheduled','confirmed','rescheduled','in_progress')
           and (? is null or assignee_user_id = ? or assignee_user_id is null)
           ${input.excludeAppointmentId ? "and id != ?" : ""}`,
      )
      .all(
        ...(input.excludeAppointmentId
          ? [
              input.orgId,
              input.assigneeUserId,
              input.assigneeUserId,
              input.excludeAppointmentId,
            ]
          : [input.orgId, input.assigneeUserId, input.assigneeUserId]),
      ) as Record<string, unknown>[];

    return rows
      .map((r) => this.mapAppointment(r))
      .filter((a) => {
        // Same assignee required for conflict (null assignee = org resource lock when both null)
        if (input.assigneeUserId && a.assigneeUserId !== input.assigneeUserId) {
          return false;
        }
        if (!input.assigneeUserId && a.assigneeUserId) return false;
        const { blockedStart, blockedEnd } = applyBuffers(
          a.startsAt,
          a.endsAt,
          a.bufferBeforeMinutes,
          a.bufferAfterMinutes,
        );
        return intervalsOverlap(
          input.blockedStart,
          input.blockedEnd,
          blockedStart,
          blockedEnd,
        );
      });
  }

  /**
   * Transactional book — BEGIN IMMEDIATE + overlap check prevents double-booking.
   */
  async bookAppointment(
    actor: SessionUser | null,
    orgId: string,
    input: {
      appointmentTypeId: string;
      bookingPageId?: string | null;
      leadId?: string | null;
      assigneeUserId?: string | null;
      startsAt: string;
      title?: string;
      location?: string | null;
      siteVisitAddress?: string | null;
      notes?: string | null;
      reminderMinutesBefore?: number;
      reminderChannel?: AppointmentReminder["channel"];
    },
  ): Promise<Appointment> {
    if (actor) await this.gate(actor, orgId, "appointments:write");
    const typeRow = this.db
      .prepare(`select * from appointment_types where org_id=? and id=? and active=1`)
      .get(orgId, input.appointmentTypeId) as Record<string, unknown> | undefined;
    if (!typeRow) throw new AuthError("Appointment type not found", "not_found");
    const type = this.mapType(typeRow);

    if (type.requiresSiteVisit && !input.siteVisitAddress) {
      throw new AuthError("Site visit address required", "validation");
    }

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new AuthError("Invalid startsAt", "validation");
    }
    const endsAt = computeEndIso(input.startsAt, type.durationMinutes);
    const { blockedStart, blockedEnd } = applyBuffers(
      input.startsAt,
      endsAt,
      type.bufferBeforeMinutes,
      type.bufferAfterMinutes,
    );
    const assigneeUserId = input.assigneeUserId ?? null;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const conflicts = this.findConflicts({
        orgId,
        assigneeUserId,
        blockedStart,
        blockedEnd,
      });
      if (conflicts.length > 0) {
        throw new AuthError(
          `Time slot conflicts with existing appointment ${conflicts[0]!.id}`,
          "conflict",
        );
      }

      const now = nowIso();
      const id = randomUUID();
      const cal = authorizeCalendarProvider("internal");
      this.db
        .prepare(
          `insert into appointments(
            id, org_id, appointment_type_id, booking_page_id, lead_id, assignee_user_id,
            status, kind, title, starts_at, ends_at, timezone, buffer_before_minutes, buffer_after_minutes,
            blocked_start, blocked_end, location, site_visit_address, notes, reminder_job_id,
            external_calendar_event_id, calendar_provider, created_at, updated_at
          ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,null,null,?,?,?)`,
        )
        .run(
          id,
          orgId,
          type.id,
          input.bookingPageId ?? null,
          input.leadId ?? null,
          assigneeUserId,
          "scheduled",
          type.kind,
          input.title ?? type.name,
          input.startsAt,
          endsAt,
          type.timezone,
          type.bufferBeforeMinutes,
          type.bufferAfterMinutes,
          blockedStart.toISOString(),
          blockedEnd.toISOString(),
          input.location ?? null,
          input.siteVisitAddress ?? null,
          input.notes ?? null,
          cal.status === "ready" ? "internal" : null,
          now,
          now,
        );

      // Schedule reminder job (durable)
      const reminderMinutes = input.reminderMinutesBefore ?? 60;
      const reminderAt = new Date(
        startsAt.getTime() - reminderMinutes * 60_000,
      ).toISOString();
      const reminderId = randomUUID();
      const channel = input.reminderChannel ?? "email";
      this.db
        .prepare(
          `insert into appointment_reminders(id, org_id, appointment_id, channel, scheduled_at, status, detail, created_at)
           values (?,?,?,?,?,'pending',null,?)`,
        )
        .run(reminderId, orgId, id, channel, reminderAt, now);
      const delayMs = Math.max(0, new Date(reminderAt).getTime() - Date.now());
      const job = await this.queue.enqueue(
        "appointment.reminder",
        { orgId, reminderId },
        {
          delayMs,
          idempotencyKey: `appt-reminder:${id}:${channel}`,
        },
      );
      this.db
        .prepare(`update appointments set reminder_job_id=? where id=?`)
        .run(job.jobId, id);

      // External calendar sync — mark pending without OAuth
      for (const provider of ["google", "microsoft"] as const) {
        const auth = authorizeCalendarProvider(provider);
        if (auth.status === "pending_configuration") {
          // leave external_calendar_event_id null — honest
        }
      }

      this.db.exec("COMMIT");
      return this.mapAppointment(
        this.db.prepare(`select * from appointments where id=?`).get(id) as Record<
          string,
          unknown
        >,
      );
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  async listAppointments(
    actor: SessionUser,
    orgId: string,
  ): Promise<Appointment[]> {
    await this.gate(actor, orgId, "appointments:read");
    const rows = this.db
      .prepare(
        `select * from appointments where org_id=? order by starts_at desc limit 200`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapAppointment(r));
  }

  async rescheduleAppointment(
    actor: SessionUser,
    orgId: string,
    appointmentId: string,
    startsAt: string,
  ): Promise<Appointment> {
    await this.gate(actor, orgId, "appointments:write");
    const row = this.db
      .prepare(`select * from appointments where org_id=? and id=?`)
      .get(orgId, appointmentId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Appointment not found", "not_found");
    const current = this.mapAppointment(row);
    if (!ACTIVE_STATUSES.includes(current.status) && current.status !== "canceled") {
      // allow reschedule from canceled? no
    }
    if (current.status === "canceled" || current.status === "completed") {
      throw new AuthError("Cannot reschedule terminal appointment", "validation");
    }
    const durationMs =
      new Date(current.endsAt).getTime() - new Date(current.startsAt).getTime();
    const endsAt = new Date(new Date(startsAt).getTime() + durationMs).toISOString();
    const { blockedStart, blockedEnd } = applyBuffers(
      startsAt,
      endsAt,
      current.bufferBeforeMinutes,
      current.bufferAfterMinutes,
    );

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const conflicts = this.findConflicts({
        orgId,
        assigneeUserId: current.assigneeUserId,
        blockedStart,
        blockedEnd,
        excludeAppointmentId: appointmentId,
      });
      if (conflicts.length > 0) {
        throw new AuthError(
          `Reschedule conflicts with appointment ${conflicts[0]!.id}`,
          "conflict",
        );
      }
      this.db
        .prepare(
          `update appointments set starts_at=?, ends_at=?, blocked_start=?, blocked_end=?, status='rescheduled', updated_at=? where id=?`,
        )
        .run(
          startsAt,
          endsAt,
          blockedStart.toISOString(),
          blockedEnd.toISOString(),
          nowIso(),
          appointmentId,
        );
      this.db.exec("COMMIT");
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
    return this.mapAppointment(
      this.db.prepare(`select * from appointments where id=?`).get(appointmentId) as Record<
        string,
        unknown
      >,
    );
  }

  async cancelAppointment(
    actor: SessionUser,
    orgId: string,
    appointmentId: string,
  ): Promise<Appointment> {
    await this.gate(actor, orgId, "appointments:write");
    const row = this.db
      .prepare(`select * from appointments where org_id=? and id=?`)
      .get(orgId, appointmentId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Appointment not found", "not_found");
    this.db
      .prepare(
        `update appointments set status='canceled', updated_at=? where id=?`,
      )
      .run(nowIso(), appointmentId);
    this.db
      .prepare(
        `update appointment_reminders set status='canceled' where appointment_id=? and status='pending'`,
      )
      .run(appointmentId);
    return this.mapAppointment(
      this.db.prepare(`select * from appointments where id=?`).get(appointmentId) as Record<
        string,
        unknown
      >,
    );
  }

  async assignAgent(
    actor: SessionUser,
    orgId: string,
    appointmentId: string,
    assigneeUserId: string,
  ): Promise<Appointment> {
    await this.gate(actor, orgId, "appointments:write");
    const row = this.db
      .prepare(`select * from appointments where org_id=? and id=?`)
      .get(orgId, appointmentId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Appointment not found", "not_found");
    const current = this.mapAppointment(row);
    const { blockedStart, blockedEnd } = applyBuffers(
      current.startsAt,
      current.endsAt,
      current.bufferBeforeMinutes,
      current.bufferAfterMinutes,
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const conflicts = this.findConflicts({
        orgId,
        assigneeUserId,
        blockedStart,
        blockedEnd,
        excludeAppointmentId: appointmentId,
      });
      if (conflicts.length > 0) {
        throw new AuthError(
          `Assignee has a conflicting appointment ${conflicts[0]!.id}`,
          "conflict",
        );
      }
      this.db
        .prepare(
          `update appointments set assignee_user_id=?, updated_at=? where id=?`,
        )
        .run(assigneeUserId, nowIso(), appointmentId);
      this.db.exec("COMMIT");
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
    return this.mapAppointment(
      this.db.prepare(`select * from appointments where id=?`).get(appointmentId) as Record<
        string,
        unknown
      >,
    );
  }

  /** Worker: process due reminder — never fakes live delivery. */
  processReminder(orgId: string, reminderId: string): void {
    const row = this.db
      .prepare(`select * from appointment_reminders where org_id=? and id=?`)
      .get(orgId, reminderId) as Record<string, unknown> | undefined;
    if (!row || String(row.status) !== "pending") return;
    const delivery = appointmentReminderDeliveryStatus(String(row.channel));
    this.db
      .prepare(
        `update appointment_reminders set status=?, detail=? where id=?`,
      )
      .run(delivery.status, delivery.detail, reminderId);
  }

  async listReminders(
    actor: SessionUser,
    orgId: string,
  ): Promise<AppointmentReminder[]> {
    await this.gate(actor, orgId, "appointments:read");
    const rows = this.db
      .prepare(
        `select * from appointment_reminders where org_id=? order by scheduled_at desc limit 100`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      appointmentId: String(r.appointment_id),
      channel: r.channel as AppointmentReminder["channel"],
      scheduledAt: String(r.scheduled_at),
      status: r.status as AppointmentReminder["status"],
      detail: r.detail ? String(r.detail) : null,
      createdAt: String(r.created_at),
    }));
  }
}
