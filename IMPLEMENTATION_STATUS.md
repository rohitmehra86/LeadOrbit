# LeadOrbit — Implementation Status

**Last updated:** 2026-10-20  
**Current focus:** Wave 4 — demand + messaging parity (cred-gated)  
**Honesty policy:** Verified vs blocked vs not-deployed only. No fabricated parity claims. **Not commercially production-ready.**

---

## Legend

| Status | Meaning |
|--------|---------|
| **Verified** | Exercised here with evidence |
| **Blocked** | Needs credentials / vendor / network |
| **Partial** | Real code path; incomplete coverage |
| **Scaffolded** | Config/docs/code ready; not live-verified |

---

## Wave 4 — Demand + messaging (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Lead ads adapters (`packages/domain/src/adapters/lead-ads.ts`) | **Verified** (unit + local fixture ingest) | Authorize/setup hints; pull never invents live leads; fixture path for tests only |
| Messaging adapters + WhatsApp verify | **Verified** (unit) | `deliverOutboundMessage` / webhook challenge; outbound stays `pending_configuration` without keys |
| Calendar OAuth start + callback | **Scaffolded** | Start URL when client IDs set; callback never claims connect success without token exchange |
| Ad spend on Results | **Verified** (unit + UI) | Unavailable vs zero vs reported — never invents zero |
| `public/leads` on Supabase | **Partial** | Migration `00015` applied (`ingest_public_lead`, `org_capture_tokens`); route wired; needs Redeploy + service role to exercise live |
| Meta/Google Insights live HTTP | **Blocked** | Creds + verified API clients |
| Live WhatsApp/email/SMS send | **Blocked** | Provider keys + HTTP adapters |
| Live calendar event sync | **Blocked** | OAuth tokens stored + Graph/Google verify |

### Mode split

| Surface | `local` | `supabase` |
|---------|---------|------------|
| Lead ads authorize/pull | SQLite adapters | Channel adapters + honest pull status |
| Inbox outbound | Queue + pending_configuration | Same honesty |
| `public/leads` | SQLite ingest | RPC + token hash (DEV_CAPTURE_TOKEN bootstrap via service role) |
| Results ad spend | Event-derived | Event-derived when marketing_events listed |

---

## Wave 3 — Advanced adapters (still current)

| Item | Status |
|------|--------|
| CRM/marketing/workflows/inbox/ingestion Postgres | Partial / verified in code |
| Invites + convert_loop | Verified |
| Local Playwright E2E | Verified (system Chrome) |

---

## Credentials still needed

1. Vercel Redeploy `main` with `AUTH_MODE=supabase` + Supabase URL/anon/`SUPABASE_SERVICE_ROLE_KEY`  
2. Meta: `META_ADS_ACCESS_TOKEN` (+ page/account for live pull); WhatsApp: `WHATSAPP_*`  
3. Google Ads: `GOOGLE_ADS_DEVELOPER_TOKEN` (+ OAuth client/refresh for live)  
4. Email/SMS: `RESEND_API_KEY`/`SMTP_URL`, `TWILIO_*`  
5. Calendar: `GOOGLE_CALENDAR_CLIENT_*`, `MICROSOFT_CALENDAR_CLIENT_*`  
6. Optional LLM keys  

Linkbook: **untouched**.

### Local runtime

- Web: http://127.0.0.1:43127  

### Tests (Wave 4)

- Domain adapters — pass (82 total domain tests)  
- Web lead-ads fixture + pending — pass  
- Typecheck — clean  

### Next (Wave 5)

- Live Stripe + Razorpay checkout  
- White-label domains + email  
- Platform admin ops  
- Usage metering + soft limits  
