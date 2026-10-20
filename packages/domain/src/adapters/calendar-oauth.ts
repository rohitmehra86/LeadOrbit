/**
 * Google / Microsoft Calendar OAuth scaffolding.
 * Blocked without OAuth client credentials. Never fakes external event sync.
 */

import {
  authorizeCalendarProvider,
  calendarOAuthCredentialsPresent,
  type CalendarProvider,
} from "../appointments";

export type ExternalCalendarProvider = Exclude<CalendarProvider, "internal">;

export function calendarOAuthSetupHints(
  provider: ExternalCalendarProvider,
): string[] {
  if (provider === "google") {
    return [
      "Set GOOGLE_CALENDAR_CLIENT_ID + GOOGLE_CALENDAR_CLIENT_SECRET",
      "Set GOOGLE_CALENDAR_REDIRECT_URI (or NEXT_PUBLIC_APP_URL + /api/v1/calendar/oauth/google/callback)",
      "Enable Google Calendar API in Cloud Console",
    ];
  }
  return [
    "Set MICROSOFT_CALENDAR_CLIENT_ID + MICROSOFT_CALENDAR_CLIENT_SECRET",
    "Set MICROSOFT_CALENDAR_REDIRECT_URI (Graph calendar.ReadWrite)",
    "Register redirect in Entra ID app",
  ];
}

export function buildCalendarOAuthStartUrl(
  provider: ExternalCalendarProvider,
  input: { orgId: string; state: string; redirectUri?: string },
): {
  status: "pending_configuration" | "ready";
  detail: string;
  url: string | null;
  setupHints: string[];
} {
  const hints = calendarOAuthSetupHints(provider);
  const auth = authorizeCalendarProvider(provider);
  if (auth.status === "pending_configuration") {
    return {
      status: "pending_configuration",
      detail: auth.detail,
      url: null,
      setupHints: hints,
    };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:43127").replace(
    /\/$/,
    "",
  );
  const redirect =
    input.redirectUri ||
    (provider === "google"
      ? process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
        `${appUrl}/api/v1/calendar/oauth/google/callback`
      : process.env.MICROSOFT_CALENDAR_REDIRECT_URI ||
        `${appUrl}/api/v1/calendar/oauth/microsoft/callback`);

  if (provider === "google") {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      state: `${input.orgId}.${input.state}`,
    });
    return {
      status: "ready",
      detail:
        "OAuth start URL built; token exchange + event sync still require verified callback handling",
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      setupHints: hints,
    };
  }

  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    response_mode: "query",
    scope: "offline_access Calendars.ReadWrite",
    state: `${input.orgId}.${input.state}`,
  });
  return {
    status: "ready",
    detail:
      "OAuth start URL built; Graph token exchange + event sync still require verified callback",
    url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`,
    setupHints: hints,
  };
}

/**
 * Sync a booked appointment to an external calendar.
 * Always blocked until OAuth tokens are stored and Graph/Google HTTP is verified.
 */
export function syncAppointmentToExternalCalendar(input: {
  provider: ExternalCalendarProvider;
  appointmentId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  hasStoredRefreshToken?: boolean;
}): {
  status: "pending_configuration" | "authorized_stub";
  detail: string;
  externalEventId: string | null;
} {
  if (!calendarOAuthCredentialsPresent(input.provider)) {
    return {
      status: "pending_configuration",
      detail: `${input.provider} OAuth client credentials not configured`,
      externalEventId: null,
    };
  }
  if (!input.hasStoredRefreshToken) {
    return {
      status: "pending_configuration",
      detail: `${input.provider} connected credentials missing — complete OAuth for org first`,
      externalEventId: null,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${input.provider} OAuth present but live event sync not verified (appt=${input.appointmentId})`,
    externalEventId: null,
  };
}
