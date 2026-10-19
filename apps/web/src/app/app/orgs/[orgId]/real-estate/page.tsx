import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getRealEstateStore } from "@/lib/tenancy/real-estate";
import { getCalendarStore } from "@/lib/tenancy/calendar";
import { Button } from "@leadorbit/ui";
import { RealEstateConsole } from "./real-estate-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function RealEstatePage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const re = getRealEstateStore();
  const enabled = await re.isModuleEnabled(user, orgId);
  const templates = await re.listIndustryTemplates(user, orgId);
  let developers: Awaited<ReturnType<typeof re.listDevelopers>> = [];
  let projects: Awaited<ReturnType<typeof re.listProjects>> = [];
  let units: Awaited<ReturnType<typeof re.listUnits>> = [];
  let brokers: Awaited<ReturnType<typeof re.listBrokers>> = [];
  let enquiries: Awaited<ReturnType<typeof re.listEnquiries>> = [];
  let analytics = {
    totalEnquiries: 0,
    byStatus: {} as Record<string, number>,
    withBroker: 0,
    siteVisits: 0,
    matchedUnits: 0,
  };
  if (enabled) {
    [developers, projects, units, brokers, enquiries, analytics] =
      await Promise.all([
        re.listDevelopers(user, orgId),
        re.listProjects(user, orgId),
        re.listUnits(user, orgId),
        re.listBrokers(user, orgId),
        re.listEnquiries(user, orgId),
        re.analytics(user, orgId),
      ]);
  }
  const appointmentTypes = await getCalendarStore().listAppointmentTypes(
    user,
    orgId,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Vertical module</p>
          <h1 className="text-3xl font-semibold tracking-tight">Real estate</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Optional inventory module — not hardcoded into core CRM. Enable per
            org. Unit prices in SQL are authoritative for AI. Education,
            automotive, and service templates are config scaffolds only.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/calendar`}>
          <Button type="button">Calendar / site visits</Button>
        </Link>
      </div>
      <RealEstateConsole
        orgId={orgId}
        enabled={enabled}
        templates={templates}
        developers={developers}
        projects={projects}
        units={units}
        brokers={brokers}
        enquiries={enquiries}
        analytics={analytics}
        appointmentTypes={appointmentTypes}
      />
    </div>
  );
}
