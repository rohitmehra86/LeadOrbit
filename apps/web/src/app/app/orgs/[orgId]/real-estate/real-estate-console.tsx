"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AppointmentType,
  Broker,
  Developer,
  EnquiryAnalytics,
  PropertyEnquiry,
  RealEstateProject,
  Unit,
  UnitMatch,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type TemplateRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  selected: boolean;
  moduleEnabled: boolean | null;
};

type Props = {
  orgId: string;
  enabled: boolean;
  templates: TemplateRow[];
  developers: Developer[];
  projects: RealEstateProject[];
  units: Unit[];
  brokers: Broker[];
  enquiries: PropertyEnquiry[];
  analytics: EnquiryAnalytics;
  appointmentTypes: AppointmentType[];
};

export function RealEstateConsole(props: Props) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [matches, setMatches] = useState<UnitMatch[]>([]);
  const [developerId, setDeveloperId] = useState(props.developers[0]?.id ?? "");
  const [projectId, setProjectId] = useState(props.projects[0]?.id ?? "");
  const [propertyId, setPropertyId] = useState("");
  const [brokerId, setBrokerId] = useState(props.brokers[0]?.id ?? "");
  const [preferenceId, setPreferenceId] = useState("");
  const [enquiryId, setEnquiryId] = useState(props.enquiries[0]?.id ?? "");

  async function enableModule(enabled: boolean) {
    await fetch(`/api/v1/orgs/${props.orgId}/real-estate/module`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled, templateId: enabled ? "real_estate" : undefined }),
    });
    router.refresh();
  }

  async function selectTemplate(templateId: string) {
    await fetch(`/api/v1/orgs/${props.orgId}/real-estate/module`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId }),
    });
    setNote(`Selected template ${templateId}`);
    router.refresh();
  }

  async function seedQuick(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const city = String(fd.get("city") || "Mumbai");
    const loc = String(fd.get("location") || "Andheri West");
    const d = await fetch(`/api/v1/orgs/${props.orgId}/real-estate/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "developer", name: fd.get("developer") || "Demo Dev" }),
    }).then((r) => r.json());
    const developerId = d.item?.id;
    const p = await fetch(`/api/v1/orgs/${props.orgId}/real-estate/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "project",
        developerId,
        name: fd.get("project") || "Demo Project",
        location: loc,
        city,
        brochurePath: "/brochures/demo.pdf",
        amenities: ["gym", "pool"],
      }),
    }).then((r) => r.json());
    const projectId = p.item?.id;
    const prop = await fetch(`/api/v1/orgs/${props.orgId}/real-estate/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "property",
        projectId,
        name: "Wing A",
        propertyType: "apartment",
      }),
    }).then((r) => r.json());
    const propertyId = prop.item?.id;
    await fetch(`/api/v1/orgs/${props.orgId}/real-estate/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "unit",
        projectId,
        propertyId,
        unitNumber: "A-1201",
        bhk: Number(fd.get("bhk") || 3),
        price: Number(fd.get("price") || 2500000),
        amenities: ["gym", "pool"],
      }),
    });
    await fetch(`/api/v1/orgs/${props.orgId}/real-estate/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "broker",
        name: "Channel Partner Co",
        channelPartner: true,
      }),
    });
    setNote("Seeded developer → project → property → unit + broker");
    setDeveloperId(developerId);
    setProjectId(projectId);
    setPropertyId(propertyId);
    router.refresh();
  }

  async function runMatch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/real-estate/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        budgetMax: Number(fd.get("budgetMax") || 0) || null,
        locations: String(fd.get("locations") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        bhk: Number(fd.get("bhk") || 0) || null,
        amenities: String(fd.get("amenities") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    const data = (await res.json()) as { items?: UnitMatch[]; detail?: string };
    if (!res.ok) {
      setNote(data.detail ?? "Match failed");
      return;
    }
    setMatches(data.items ?? []);
  }

  async function createEnquiryFlow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pref = await fetch(`/api/v1/orgs/${props.orgId}/real-estate/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "preferences",
        budgetMax: Number(fd.get("budgetMax") || 0) || null,
        locations: String(fd.get("locations") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        bhkMin: Number(fd.get("bhk") || 0) || null,
        bhkMax: Number(fd.get("bhk") || 0) || null,
        mustHaveAmenities: String(fd.get("amenities") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    }).then((r) => r.json());
    setPreferenceId(pref.item?.id ?? "");
    const enq = await fetch(`/api/v1/orgs/${props.orgId}/real-estate/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        preferenceId: pref.item?.id,
        brokerId: brokerId || undefined,
        autoMatch: true,
        message: fd.get("message") || "Property enquiry",
      }),
    }).then((r) => r.json());
    setEnquiryId(enq.enquiry?.id ?? "");
    setMatches(enq.matches ?? []);
    setNote(`Enquiry ${enq.enquiry?.status} · ${enq.matches?.length ?? 0} matches`);
    router.refresh();
  }

  async function bookSiteVisit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const typeId = String(fd.get("appointmentTypeId") || "");
    if (!enquiryId || !typeId) {
      setNote("Need enquiry + site_visit appointment type (create in Calendar)");
      return;
    }
    const res = await fetch(`/api/v1/orgs/${props.orgId}/real-estate/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "site_visit",
        enquiryId,
        appointmentTypeId: typeId,
        startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
        siteVisitAddress: fd.get("address"),
      }),
    });
    const data = (await res.json()) as { detail?: string; appointmentId?: string };
    setNote(
      res.ok
        ? `Site visit booked ${data.appointmentId}`
        : data.detail ?? "Site visit failed",
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-center gap-3">
        <Badge>{props.enabled ? "module:enabled" : "module:disabled"}</Badge>
        <Button type="button" onClick={() => enableModule(true)}>
          Enable real estate
        </Button>
        <Button type="button" onClick={() => enableModule(false)}>
          Disable
        </Button>
      </section>

      {note ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {note}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-xl font-semibold">Industry templates</h2>
        <ul className="grid gap-2 text-sm md:grid-cols-2">
          {props.templates.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-[var(--lo-border)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>{t.name}</strong>
                <Badge>{t.status}</Badge>
                {t.selected ? <Badge>selected</Badge> : null}
              </div>
              <p className="mt-1 text-[var(--lo-fg-muted)]">{t.description}</p>
              <Button
                type="button"
                className="mt-2"
                onClick={() => selectTemplate(t.id)}
              >
                Select
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {!props.enabled ? (
        <p className="text-sm text-[var(--lo-fg-muted)]">
          Enable the module to manage inventory, matching, and enquiries.
        </p>
      ) : (
        <>
          <section className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Quick seed inventory</h2>
              <form onSubmit={seedQuick} className="grid gap-2 sm:grid-cols-2">
                <input
                  name="developer"
                  placeholder="Developer"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="project"
                  placeholder="Project"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="city"
                  defaultValue="Mumbai"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="location"
                  defaultValue="Andheri West"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="bhk"
                  type="number"
                  defaultValue={3}
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="price"
                  type="number"
                  defaultValue={2500000}
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <Button type="submit">Seed sample</Button>
              </form>
              <p className="text-xs text-[var(--lo-fg-muted)]">
                {props.developers.length} developers · {props.projects.length}{" "}
                projects · {props.units.length} units · {props.brokers.length}{" "}
                brokers
                {developerId ? ` · lastDev ${developerId.slice(0, 8)}` : ""}
                {propertyId ? ` · prop ${propertyId.slice(0, 8)}` : ""}
              </p>
              <ul className="text-sm">
                {props.units.slice(0, 8).map((u) => (
                  <li key={u.id} className="border-t border-[var(--lo-border)] py-1">
                    {u.unitNumber} · {u.bhk}BHK ·{" "}
                    {u.price == null ? "price on request" : u.price} · {u.status}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Inventory match</h2>
              <form onSubmit={runMatch} className="flex flex-col gap-2">
                <input
                  name="budgetMax"
                  type="number"
                  placeholder="Budget max"
                  defaultValue={3000000}
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="locations"
                  placeholder="Locations (comma)"
                  defaultValue="Mumbai"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="bhk"
                  type="number"
                  placeholder="BHK"
                  defaultValue={3}
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="amenities"
                  placeholder="Amenities (comma)"
                  defaultValue="gym"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <Button type="submit">Search / match</Button>
              </form>
              <ul className="text-sm">
                {matches.map((m) => (
                  <li key={m.unit.id} className="border-t border-[var(--lo-border)] py-2">
                    score {m.score} · {m.projectName} · {m.unit.unitNumber} ·{" "}
                    {m.unit.price ?? "POR"} · {m.reasons.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Enquiry + broker tracking</h2>
              <label className="text-sm text-[var(--lo-fg-muted)]">
                Broker
                <select
                  className="mt-1 w-full rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2"
                  value={brokerId}
                  onChange={(e) => setBrokerId(e.target.value)}
                >
                  <option value="">None</option>
                  {props.brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.channelPartner ? " (CP)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <form onSubmit={createEnquiryFlow} className="flex flex-col gap-2">
                <input
                  name="budgetMax"
                  type="number"
                  defaultValue={3000000}
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="locations"
                  defaultValue="Andheri"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="bhk"
                  type="number"
                  defaultValue={3}
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="amenities"
                  defaultValue="gym"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="message"
                  placeholder="Message"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <Button type="submit">Create enquiry (auto-match)</Button>
              </form>
              {preferenceId ? (
                <p className="text-xs text-[var(--lo-fg-muted)]">
                  Preference {preferenceId.slice(0, 8)}…
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Site visit (calendar)</h2>
              <p className="text-sm text-[var(--lo-fg-muted)]">
                Analytics: {props.analytics.totalEnquiries} enquiries ·{" "}
                {props.analytics.withBroker} broker · {props.analytics.siteVisits}{" "}
                visits · {props.analytics.matchedUnits} matched
              </p>
              <form onSubmit={bookSiteVisit} className="flex flex-col gap-2">
                <select
                  name="appointmentTypeId"
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                  defaultValue={
                    props.appointmentTypes.find((t) => t.kind === "site_visit")
                      ?.id ?? props.appointmentTypes[0]?.id
                  }
                >
                  {props.appointmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.kind})
                    </option>
                  ))}
                </select>
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="address"
                  required
                  placeholder="Site address"
                  defaultValue={
                    props.projects[0]
                      ? `${props.projects[0].name}, ${props.projects[0].location}`
                      : ""
                  }
                  className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={!enquiryId}>
                  Schedule site visit
                </Button>
              </form>
              <ul className="text-sm">
                {props.enquiries.slice(0, 8).map((e) => (
                  <li key={e.id} className="border-t border-[var(--lo-border)] py-1">
                    <button type="button" onClick={() => setEnquiryId(e.id)}>
                      {e.status} · {e.source}
                      {e.brokerId ? " · broker" : ""}
                      {enquiryId === e.id ? " ✓" : ""}
                    </button>
                  </li>
                ))}
              </ul>
              {projectId ? (
                <p className="text-xs text-[var(--lo-fg-muted)]">
                  Active project context {projectId.slice(0, 8)}…
                </p>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
