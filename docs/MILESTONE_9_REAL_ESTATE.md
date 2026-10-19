# Milestone 9 — Real estate vertical (optional)

## Design

- **Not hardcoded into core CRM.** Enable via `org_vertical_modules.module_key = real_estate`.
- Entities live in `re_*` tables only.
- Site visits reuse Milestone 8 calendar (`CalendarStore.bookAppointment`).
- AI inventory lookup merges RE unit prices only when the module is enabled — SQL remains authoritative.

## Entities

Developers, projects, properties, towers, units, floor plans, amenities (JSON), pricing, inventory status, brokers / channel partners, buyer preferences, property enquiries, brochures (`brochure_path`).

## Capabilities

| Capability | Implementation |
|------------|----------------|
| Property matching | `scoreUnitMatch` + `matchInventory` (budget/location/BHK/amenities) |
| Inventory search | Same match API |
| Site visit scheduling | Calendar transactional booking |
| Agent routing | Enquiry assignee defaults to actor |
| Broker lead tracking | `broker_id` on enquiries + analytics |
| Enquiry analytics | Counts by status / broker / visits |
| Industry templates | real_estate ready; education/automotive/service_business scaffold |

## Surfaces

- UI: `/app/orgs/:id/real-estate`
- APIs: `*/real-estate/module`, `inventory`, `match`, `enquiries`

## Verified

- Unit: matching filters, template statuses
- Store: tenant isolation, match, enquiry+site visit, AI price lookup gated by module
- Not verified: remote Postgres RLS against live Supabase
