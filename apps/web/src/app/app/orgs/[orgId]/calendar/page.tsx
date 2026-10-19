import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getCalendarStore } from "@/lib/tenancy/calendar";
import { getVoiceStore } from "@/lib/tenancy/voice";
import { Button } from "@leadorbit/ui";
import { CalendarConsole } from "./calendar-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function CalendarPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const cal = getCalendarStore();
  const voice = getVoiceStore();
  const [types, appointments, pages, connections, availability, reminders, calls, analytics, policy] =
    await Promise.all([
      cal.listAppointmentTypes(user, orgId),
      cal.listAppointments(user, orgId),
      cal.listBookingPages(user, orgId),
      cal.listCalendarConnections(user, orgId),
      cal.listAvailability(user, orgId),
      cal.listReminders(user, orgId),
      voice.listCalls(user, orgId),
      voice.analytics(user, orgId),
      voice.getPolicy(user, orgId),
    ]);
  const voiceConnections = await voice.listConnections(user, orgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Scheduling</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Calendar & voice
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Transactional booking with buffers and conflict prevention. Google /
            Microsoft calendar OAuth and telephony stay{" "}
            <code>pending_configuration</code> without credentials — never faked
            as live success.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/ai`}>
          <Button type="button">AI agents</Button>
        </Link>
      </div>
      <CalendarConsole
        orgId={orgId}
        userId={user.id}
        types={types}
        appointments={appointments}
        pages={pages}
        connections={connections}
        availability={availability}
        reminders={reminders}
        voiceConnections={voiceConnections}
        calls={calls}
        analytics={analytics}
        policy={policy}
      />
    </div>
  );
}
