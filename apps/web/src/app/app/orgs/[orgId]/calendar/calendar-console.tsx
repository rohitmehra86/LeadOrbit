"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Appointment,
  AppointmentReminder,
  AppointmentType,
  BookingPage,
  CalendarConnection,
  TeamAvailability,
  VoiceAnalytics,
  VoiceCall,
  VoiceConnection,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  userId: string;
  types: AppointmentType[];
  appointments: Appointment[];
  pages: BookingPage[];
  connections: CalendarConnection[];
  availability: TeamAvailability[];
  reminders: AppointmentReminder[];
  voiceConnections: VoiceConnection[];
  calls: VoiceCall[];
  analytics: VoiceAnalytics;
  policy: { legalOutboundAllowed: boolean; requireRecordingConsent: boolean };
};

export function CalendarConsole(props: Props) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [typeId, setTypeId] = useState(props.types[0]?.id ?? "");

  async function createType(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/v1/orgs/${props.orgId}/calendar/types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        kind: fd.get("kind"),
        durationMinutes: Number(fd.get("durationMinutes") || 30),
        bufferBeforeMinutes: Number(fd.get("bufferBefore") || 0),
        bufferAfterMinutes: Number(fd.get("bufferAfter") || 0),
        requiresSiteVisit: fd.get("siteVisit") === "on",
        timezone: fd.get("timezone") || "UTC",
      }),
    });
    e.currentTarget.reset();
    router.refresh();
  }

  async function setAvailability(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetch(`/api/v1/orgs/${props.orgId}/calendar/availability`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: props.userId,
        windows: [
          { weekday: 1, startTime: "09:00", endTime: "17:00", timezone: "UTC" },
          { weekday: 2, startTime: "09:00", endTime: "17:00", timezone: "UTC" },
          { weekday: 3, startTime: "09:00", endTime: "17:00", timezone: "UTC" },
          { weekday: 4, startTime: "09:00", endTime: "17:00", timezone: "UTC" },
          { weekday: 5, startTime: "09:00", endTime: "17:00", timezone: "UTC" },
        ],
      }),
    });
    setNote("Weekday 09:00–17:00 UTC availability saved");
    router.refresh();
  }

  async function createBookingPage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/calendar/booking-pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: fd.get("slug"),
        title: fd.get("title"),
        appointmentTypeId: typeId || fd.get("appointmentTypeId"),
        assignedUserIds: [props.userId],
        public: true,
      }),
    });
    const data = (await res.json()) as { detail?: string };
    setNote(res.ok ? "Booking page created" : data.detail ?? "Failed");
    router.refresh();
  }

  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/appointments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appointmentTypeId: typeId,
        startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
        assigneeUserId: props.userId,
        siteVisitAddress: fd.get("siteVisitAddress") || null,
        title: fd.get("title") || undefined,
        reminderMinutesBefore: 60,
      }),
    });
    const data = (await res.json()) as { detail?: string; item?: Appointment };
    if (res.status === 409 || data.detail?.includes("conflict")) {
      setNote(data.detail ?? "Conflict — slot taken");
    } else if (!res.ok) {
      setNote(data.detail ?? "Booking failed");
    } else {
      setNote(`Booked ${data.item?.id}`);
    }
    router.refresh();
  }

  async function cancelAppt(id: string) {
    await fetch(`/api/v1/orgs/${props.orgId}/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    router.refresh();
  }

  async function toggleOutbound(allowed: boolean) {
    await fetch(`/api/v1/orgs/${props.orgId}/voice/connections`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ legalOutboundAllowed: allowed }),
    });
    router.refresh();
  }

  async function startCall(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/voice/calls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        direction: fd.get("direction"),
        toNumber: fd.get("toNumber"),
        fromNumber: fd.get("fromNumber") || "+10000000000",
        recordingConsent: fd.get("consent") === "on",
        aiAssisted: fd.get("ai") === "on",
      }),
    });
    const data = (await res.json()) as { item?: VoiceCall; detail?: string };
    setNote(
      data.item
        ? `Call ${data.item.status}: ${data.item.detail}`
        : data.detail ?? "Call failed",
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap gap-2 text-sm">
        {props.connections.map((c) => (
          <Badge key={c.id}>
            cal/{c.provider}: {c.status}
          </Badge>
        ))}
        {props.voiceConnections.map((c) => (
          <Badge key={c.id}>
            voice/{c.provider}: {c.status}
          </Badge>
        ))}
        <Badge>
          outbound legal: {props.policy.legalOutboundAllowed ? "yes" : "no"}
        </Badge>
      </section>

      {note ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {note}
        </p>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Appointment types</h2>
          <form onSubmit={createType} className="grid gap-2 sm:grid-cols-2">
            <input
              name="name"
              required
              placeholder="Name"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              name="kind"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
              defaultValue="consultation"
            >
              <option value="consultation">Consultation</option>
              <option value="demo">Demo</option>
              <option value="site_visit">Site visit</option>
              <option value="callback">Callback</option>
            </select>
            <input
              name="durationMinutes"
              type="number"
              defaultValue={30}
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="timezone"
              defaultValue="UTC"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="bufferBefore"
              type="number"
              defaultValue={10}
              placeholder="Buffer before"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="bufferAfter"
              type="number"
              defaultValue={10}
              placeholder="Buffer after"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input name="siteVisit" type="checkbox" /> Requires site visit
              address
            </label>
            <Button type="submit">Create type</Button>
          </form>
          <ul className="text-sm">
            {props.types.map((t) => (
              <li key={t.id} className="border-t border-[var(--lo-border)] py-2">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setTypeId(t.id)}
                >
                  {t.name} · {t.durationMinutes}m · buffers {t.bufferBeforeMinutes}/
                  {t.bufferAfterMinutes}
                  {typeId === t.id ? " ✓" : ""}
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={setAvailability}>
            <Button type="submit">Set Mon–Fri 09–17 UTC availability</Button>
          </form>
          <p className="text-xs text-[var(--lo-fg-muted)]">
            {props.availability.length} availability windows configured
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Book / booking pages</h2>
          <form onSubmit={book} className="flex flex-col gap-2">
            <input
              name="title"
              placeholder="Title"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="startsAt"
              type="datetime-local"
              required
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="siteVisitAddress"
              placeholder="Site visit address (if required)"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={!typeId}>
              Book (conflict-safe)
            </Button>
          </form>
          <form onSubmit={createBookingPage} className="flex flex-col gap-2">
            <input
              name="slug"
              required
              placeholder="public-slug"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="title"
              required
              placeholder="Booking page title"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={!typeId}>
              Create public booking page
            </Button>
          </form>
          <ul className="text-sm">
            {props.pages.map((p) => (
              <li key={p.id} className="border-t border-[var(--lo-border)] py-2">
                /api/v1/public/booking/{props.orgId}/{p.slug}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Appointments</h2>
        <ul className="text-sm">
          {props.appointments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--lo-border)] py-2"
            >
              <span>
                {a.status} · {a.title} · {a.startsAt.slice(0, 16)} →{" "}
                {a.endsAt.slice(11, 16)} UTC
                {a.siteVisitAddress ? ` · visit ${a.siteVisitAddress}` : ""}
              </span>
              {a.status !== "canceled" ? (
                <Button type="button" onClick={() => cancelAppt(a.id)}>
                  Cancel
                </Button>
              ) : null}
            </li>
          ))}
          {props.appointments.length === 0 ? (
            <li className="text-[var(--lo-fg-muted)]">No appointments</li>
          ) : null}
        </ul>
        <p className="mt-2 text-xs text-[var(--lo-fg-muted)]">
          Reminders:{" "}
          {props.reminders
            .slice(0, 3)
            .map((r) => `${r.channel}/${r.status}`)
            .join(", ") || "none"}
        </p>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Voice / calling</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => toggleOutbound(true)}>
              Allow outbound (legal)
            </Button>
            <Button type="button" onClick={() => toggleOutbound(false)}>
              Disallow outbound
            </Button>
          </div>
          <form onSubmit={startCall} className="flex flex-col gap-2">
            <select
              name="direction"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
              defaultValue="inbound"
            >
              <option value="inbound">Inbound accept</option>
              <option value="outbound">Outbound scaffold</option>
            </select>
            <input
              name="fromNumber"
              placeholder="From"
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              name="toNumber"
              placeholder="To"
              required
              className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input name="consent" type="checkbox" defaultChecked /> Recording
              consent
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="ai" type="checkbox" /> AI-assisted qualification hook
            </label>
            <Button type="submit">Start call scaffold</Button>
          </form>
        </div>
        <div>
          <h2 className="mb-2 text-xl font-semibold">Call history / analytics</h2>
          <p className="mb-2 text-sm text-[var(--lo-fg-muted)]">
            {props.analytics.totalCalls} calls ·{" "}
            {props.analytics.pendingConfiguration} pending_configuration ·{" "}
            {props.analytics.appointmentsBooked} appts · $
            {props.analytics.totalCostUsd} cost
          </p>
          <ul className="text-sm">
            {props.calls.slice(0, 10).map((c) => (
              <li key={c.id} className="border-t border-[var(--lo-border)] py-2">
                {c.direction} · {c.status} · {c.outcome} · consent=
                {String(c.recordingConsent)} · {c.detail}
              </li>
            ))}
            {props.calls.length === 0 ? (
              <li className="text-[var(--lo-fg-muted)]">No calls yet</li>
            ) : null}
          </ul>
        </div>
      </section>
    </div>
  );
}
