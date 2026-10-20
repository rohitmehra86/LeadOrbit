import { AuthError, type SessionUser } from "@leadorbit/db";
import type {
  Appointment,
  AppointmentKind,
  AppointmentReminder,
  AppointmentType,
  BookingPage,
  CalendarConnection,
  TeamAvailability,
} from "@leadorbit/domain";
import { hasPermission } from "@leadorbit/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenancyStore } from "@/lib/tenancy/service";

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

async function gate(actor: SessionUser, orgId: string): Promise<void> {
  if (actor.isPlatformAdmin) return;
  const m = await getTenancyStore().getMembership(actor.id, orgId);
  if (!m || !hasPermission(m.role, "calendar:read")) {
    throw new AuthError("Forbidden for this organization", "forbidden");
  }
}

function unsupported(method: string): never {
  throw new AuthError(
    `Calendar method "${method}" is not available on the Supabase adapter yet`,
    "validation",
  );
}

function mapType(r: Record<string, unknown>): AppointmentType {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    name: String(r.name),
    kind: r.kind as AppointmentKind,
    durationMinutes: Number(r.duration_minutes),
    bufferBeforeMinutes: Number(r.buffer_before_minutes ?? 0),
    bufferAfterMinutes: Number(r.buffer_after_minutes ?? 0),
    timezone: String(r.timezone ?? "UTC"),
    requiresSiteVisit: Boolean(r.requires_site_visit),
    description: r.description ? String(r.description) : null,
    active: r.active !== false,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapAppt(r: Record<string, unknown>): Appointment {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    appointmentTypeId: String(r.appointment_type_id),
    bookingPageId: r.booking_page_id ? String(r.booking_page_id) : null,
    leadId: r.lead_id ? String(r.lead_id) : null,
    assigneeUserId: r.assignee_user_id ? String(r.assignee_user_id) : null,
    status: r.status as Appointment["status"],
    kind: r.kind as AppointmentKind,
    title: String(r.title),
    startsAt: String(r.starts_at),
    endsAt: String(r.ends_at),
    timezone: String(r.timezone),
    bufferBeforeMinutes: Number(r.buffer_before_minutes ?? 0),
    bufferAfterMinutes: Number(r.buffer_after_minutes ?? 0),
    location: r.location ? String(r.location) : null,
    siteVisitAddress: r.site_visit_address ? String(r.site_visit_address) : null,
    notes: r.notes ? String(r.notes) : null,
    reminderJobId: r.reminder_job_id ? String(r.reminder_job_id) : null,
    externalCalendarEventId: r.external_calendar_event_id
      ? String(r.external_calendar_event_id)
      : null,
    calendarProvider: r.calendar_provider
      ? (r.calendar_provider as Appointment["calendarProvider"])
      : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/** Durable calendar slice for AUTH_MODE=supabase (types + appointments + site visits). */
export class SupabaseCalendarStore {
  async listAppointmentTypes(
    actor: SessionUser,
    orgId: string,
  ): Promise<AppointmentType[]> {
    await gate(actor, orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("appointment_types")
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map(mapType);
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
    await gate(actor, orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("appointment_types")
      .insert({
        org_id: orgId,
        name: input.name,
        kind: input.kind ?? "consultation",
        duration_minutes: input.durationMinutes ?? 30,
        buffer_before_minutes: input.bufferBeforeMinutes ?? 0,
        buffer_after_minutes: input.bufferAfterMinutes ?? 0,
        timezone: input.timezone ?? "UTC",
        requires_site_visit: Boolean(input.requiresSiteVisit),
        description: input.description ?? null,
        active: true,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapType(data as Record<string, unknown>);
  }

  async listAppointments(actor: SessionUser, orgId: string): Promise<Appointment[]> {
    await gate(actor, orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("org_id", orgId)
      .order("starts_at", { ascending: true })
      .limit(200);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map(mapAppt);
  }

  async listReminders(
    _actor: SessionUser,
    _orgId: string,
  ): Promise<AppointmentReminder[]> {
    return [];
  }

  async bookAppointment(
    actor: SessionUser,
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
    },
  ): Promise<Appointment> {
    await gate(actor, orgId);
    const supabase = await client();
    const { data: typeRow } = await supabase
      .from("appointment_types")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", input.appointmentTypeId)
      .maybeSingle();
    if (!typeRow) throw new AuthError("Appointment type not found", "not_found");
    const duration = Number(typeRow.duration_minutes ?? 30);
    const starts = new Date(input.startsAt);
    const ends = new Date(starts.getTime() + duration * 60_000);
    const bufferBefore = Number(typeRow.buffer_before_minutes ?? 0);
    const bufferAfter = Number(typeRow.buffer_after_minutes ?? 0);
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        org_id: orgId,
        appointment_type_id: input.appointmentTypeId,
        booking_page_id: input.bookingPageId ?? null,
        lead_id: input.leadId ?? null,
        assignee_user_id: input.assigneeUserId ?? actor.id,
        status: "scheduled",
        kind: typeRow.kind,
        title: input.title ?? String(typeRow.name),
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        timezone: String(typeRow.timezone ?? "UTC"),
        buffer_before_minutes: bufferBefore,
        buffer_after_minutes: bufferAfter,
        blocked_start: new Date(starts.getTime() - bufferBefore * 60_000).toISOString(),
        blocked_end: new Date(ends.getTime() + bufferAfter * 60_000).toISOString(),
        location: input.location ?? null,
        site_visit_address: input.siteVisitAddress ?? null,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapAppt(data as Record<string, unknown>);
  }

  async cancelAppointment(..._args: unknown[]): Promise<Appointment> {
    unsupported("cancelAppointment");
  }
  async rescheduleAppointment(..._args: unknown[]): Promise<Appointment> {
    unsupported("rescheduleAppointment");
  }
  async assignAgent(..._args: unknown[]): Promise<Appointment> {
    unsupported("assignAgent");
  }
  async listAvailability(
    _actor: SessionUser,
    _orgId: string,
  ): Promise<TeamAvailability[]> {
    return [];
  }
  async setAvailability(..._args: unknown[]): Promise<TeamAvailability> {
    unsupported("setAvailability");
  }
  async listBookingPages(_actor: SessionUser, _orgId: string): Promise<BookingPage[]> {
    return [];
  }
  async createBookingPage(..._args: unknown[]): Promise<BookingPage> {
    unsupported("createBookingPage");
  }
  async listCalendarConnections(
    _actor: SessionUser,
    _orgId: string,
  ): Promise<CalendarConnection[]> {
    return [];
  }
  async getPublicBookingPage(..._args: unknown[]): Promise<null> {
    return null;
  }
}

let singleton: SupabaseCalendarStore | null = null;

export function getSupabaseCalendarStore(): SupabaseCalendarStore {
  if (!singleton) singleton = new SupabaseCalendarStore();
  return singleton;
}
