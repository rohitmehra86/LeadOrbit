# Milestone 8 — Voice, calendar, appointments

## Calendar / appointments

- Appointment types with duration, buffers, timezone, site-visit flag
- Team availability windows, public booking pages
- **Transactional booking** (`BEGIN IMMEDIATE` + buffered overlap check) prevents double-booking
- Reschedule / cancel / agent assignment with the same conflict rules
- Reminders enqueued to `apps/worker` (`appointment.reminder`) — delivery `pending_configuration` without messaging creds
- Google / Microsoft calendar OAuth adapters: `pending_configuration` without client IDs/secrets

## Voice / calling

- Pluggable providers: Twilio, Vonage, custom
- Inbound accept + outbound scaffold (legal outbound flag + recording consent)
- AI-assisted qualification hook, transcription/summary/outcome scaffolding
- Human transfer, book appointment from call (uses calendar conflict prevention)
- Call history, cost tracking, analytics
- **Never fakes live call success** — status stays `pending_configuration` without verified provider path

## Surfaces

| Path | Role |
|------|------|
| `/app/orgs/:id/calendar` | Calendar + voice console |
| `*/calendar/*`, `*/appointments` | Authenticated APIs |
| `POST /api/v1/public/booking/:orgId/:slug` | Public booking |
| `*/voice/connections`, `*/voice/calls` | Telephony |

## Verified

- Unit: overlap/buffers, calendar OAuth pending, voice pending / legal block
- Store: double-book conflict, reschedule after cancel, site visit address, outbound pending
- Not verified: live Google/Microsoft OAuth, live Twilio/Vonage dial
