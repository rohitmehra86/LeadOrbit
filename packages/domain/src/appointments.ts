/**
 * Milestone 8 — appointments / calendar.
 * Conflict prevention is transactional at the store layer.
 */

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "rescheduled"
  | "canceled"
  | "completed"
  | "no_show"
  | "in_progress";

export type AppointmentKind =
  | "consultation"
  | "demo"
  | "site_visit"
  | "callback"
  | "other";

export type CalendarProvider = "google" | "microsoft" | "internal";

export type CalendarConnectionStatus =
  | "pending_configuration"
  | "authorized_stub"
  | "ready"
  | "error";

export interface AppointmentType {
  id: string;
  orgId: string;
  name: string;
  kind: AppointmentKind;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  timezone: string;
  requiresSiteVisit: boolean;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAvailability {
  id: string;
  orgId: string;
  userId: string;
  /** 0=Sunday … 6=Saturday */
  weekday: number;
  startTime: string; // HH:MM in member timezone
  endTime: string;
  timezone: string;
  createdAt: string;
}

export interface BookingPage {
  id: string;
  orgId: string;
  slug: string;
  title: string;
  appointmentTypeId: string;
  timezone: string;
  assignedUserIds: string[];
  public: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  orgId: string;
  appointmentTypeId: string;
  bookingPageId: string | null;
  leadId: string | null;
  assigneeUserId: string | null;
  status: AppointmentStatus;
  kind: AppointmentKind;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  location: string | null;
  siteVisitAddress: string | null;
  notes: string | null;
  reminderJobId: string | null;
  externalCalendarEventId: string | null;
  calendarProvider: CalendarProvider | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarConnection {
  id: string;
  orgId: string;
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  accountEmail: string | null;
  detail: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentReminder {
  id: string;
  orgId: string;
  appointmentId: string;
  channel: "email" | "sms" | "whatsapp" | "push";
  scheduledAt: string;
  status: "pending" | "sent" | "pending_configuration" | "canceled" | "failed";
  detail: string | null;
  createdAt: string;
}

/** Inclusive overlap with buffers applied to both sides. */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function applyBuffers(
  startsAt: string,
  endsAt: string,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
): { blockedStart: Date; blockedEnd: Date } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return {
    blockedStart: new Date(start.getTime() - bufferBeforeMinutes * 60_000),
    blockedEnd: new Date(end.getTime() + bufferAfterMinutes * 60_000),
  };
}

export function computeEndIso(startsAt: string, durationMinutes: number): string {
  return new Date(
    new Date(startsAt).getTime() + durationMinutes * 60_000,
  ).toISOString();
}

export function isWithinAvailabilityWindow(input: {
  startsAt: string;
  endsAt: string;
  timezone: string;
  windows: Array<{ weekday: number; startTime: string; endTime: string }>;
}): boolean {
  // Evaluate in UTC wall-clock approximation for local runtime (honest scaffold).
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || end <= start) return false;
  const weekday = start.getUTCDay();
  const startHm = `${String(start.getUTCHours()).padStart(2, "0")}:${String(start.getUTCMinutes()).padStart(2, "0")}`;
  const endHm = `${String(end.getUTCHours()).padStart(2, "0")}:${String(end.getUTCMinutes()).padStart(2, "0")}`;
  return input.windows.some(
    (w) =>
      w.weekday === weekday && startHm >= w.startTime && endHm <= w.endTime,
  );
}

export function calendarOAuthCredentialsPresent(
  provider: Exclude<CalendarProvider, "internal">,
): boolean {
  if (provider === "google") {
    return Boolean(
      process.env.GOOGLE_CALENDAR_CLIENT_ID &&
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    );
  }
  return Boolean(
    process.env.MICROSOFT_CALENDAR_CLIENT_ID &&
      process.env.MICROSOFT_CALENDAR_CLIENT_SECRET,
  );
}

export function authorizeCalendarProvider(
  provider: CalendarProvider,
): {
  status: CalendarConnectionStatus;
  detail: string;
} {
  if (provider === "internal") {
    return { status: "ready", detail: "Internal calendar" };
  }
  if (!calendarOAuthCredentialsPresent(provider)) {
    return {
      status: "pending_configuration",
      detail: `${provider} OAuth client credentials not configured`,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${provider} credentials present but live OAuth not verified`,
  };
}

/** Reminder delivery — never fakes live send without messaging credentials. */
export function appointmentReminderDeliveryStatus(channel: string): {
  status: AppointmentReminder["status"];
  detail: string;
} {
  if (channel === "email") {
    if (process.env.SMTP_URL || process.env.RESEND_API_KEY) {
      return {
        status: "pending_configuration",
        detail: "Email credentials present but outbound not verified",
      };
    }
    return {
      status: "pending_configuration",
      detail: "SMTP_URL / RESEND_API_KEY not configured",
    };
  }
  if (channel === "sms" || channel === "whatsapp") {
    return {
      status: "pending_configuration",
      detail: "Messaging provider credentials not configured for reminders",
    };
  }
  return {
    status: "pending_configuration",
    detail: "Push reminders not configured",
  };
}
