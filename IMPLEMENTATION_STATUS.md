# LeadOrbit — Implementation Status

**Last updated:** 2026-10-19  
**Current milestone focus:** Milestone 8 (Voice, calendar, appointments)  
**Honesty policy:** Status reflects verified reality only.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Implemented/verified** | Code exists and was exercised here |
| **Blocked** | Needs credentials/tooling |
| **Not implemented** | Not started |

---

## Milestone 1–7

| Area | Status |
|------|--------|
| Foundation through AI/RAG/knowledge | Implemented/verified |
| Live Supabase / RLS / messaging / LLM providers | **Blocked** (no credentials) |

---

## Milestone 8 — Voice, calendar & appointments

| Item | Status | Notes |
|------|--------|-------|
| Appointment types, availability, booking pages, timezones, duration, buffers | Implemented/verified | |
| Transactional conflict prevention (double-book) | Implemented/verified | Store tests |
| Reschedule / cancel / reminders / agent assignment | Implemented/verified | |
| Site visit booking | Implemented/verified | Address required |
| Google / Microsoft calendar OAuth adapters | Implemented/verified | `pending_configuration` without creds |
| Pluggable telephony (inbound/outbound scaffold) | Implemented/verified | |
| AI qualification hooks, transcription/summary/outcome scaffold | Implemented/verified | |
| Human transfer, book appt from call, history, consent, cost, analytics | Implemented/verified | |
| Migration `00009_calendar_voice.sql` | Implemented/verified (authored) | |
| Live calendar OAuth / live call dial | **Blocked** | Never faked |
| Draft PR | **Blocked** | `agent_temp` remote |

---

## Milestones 9–12

Not implemented. Not claimed.

---

## Blockers for Rohit

1. Supabase (migrations through 00009)  
2. `GOOGLE_CALENDAR_CLIENT_ID/SECRET`, `MICROSOFT_CALENDAR_CLIENT_ID/SECRET`  
3. `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (or Vonage)  
4. LLM / messaging credentials (prior milestones)  
5. Standard GitHub remote for PRs  

---

## Known issues

1. Auth tenancy in-memory; domain data in SQLite.  
2. Web + worker must share `LEADORBIT_SQLITE_PATH`.  
3. Availability windows use UTC wall-clock approximation in local runtime.  
4. Reminder “send” is pending without SMTP/SMS credentials.
