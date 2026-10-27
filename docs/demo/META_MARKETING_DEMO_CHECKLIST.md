# Meta marketing module — demonstration checklist

Use this with a digital marketing expert. Creates **PAUSED** Meta objects by default (no automatic spend).

---

## Prerequisites (env names only — never paste secrets)

| Variable | Required for |
|----------|----------------|
| `META_ADS_APP_ID` | OAuth + API (LeadOrbitGamingApp: `1828424055013488`) |
| `META_ADS_APP_SECRET` | OAuth + API (server-only) |
| `META_ADS_LOGIN_CONFIG_ID` | Facebook Login for Business config id (LeadOrbitConfig: `1436209141980934`) |
| `META_ADS_OAUTH_REDIRECT_URI` | Optional; default `{NEXT_PUBLIC_APP_URL}/api/v1/meta/oauth/callback` |
| `META_ADS_TOKEN_ENCRYPTION_KEY` | Per-org token ciphertext |
| `NEXT_PUBLIC_APP_URL` | OAuth redirect + landing URLs |
| `META_ADS_ACCESS_TOKEN` / `META_ADS_AD_ACCOUNT_ID` / `META_ADS_PAGE_ID` | Optional env fallback if org has not Connected Meta |
| `META_ADS_PIXEL_ID` | Optional env fallback for website leads |
| `META_ADS_LEAD_GEN_FORM_ID` | Optional env fallback for Instant Form |
| `LLM_API_KEY` or `OPENAI_API_KEY` | AI ad copy (optional; template fallback without key) |
| `LLM_BASE_URL` / `LLM_MODEL` | Optional OpenAI-compatible overrides |

**Migration (manual):** apply `supabase/migrations/00023_meta_connection_lead_assets.sql` before relying on per-org Pixel / Instant Form columns in production Supabase. Do not auto-apply.

**Meta App dashboard:**

1. Business-type app (`LeadOrbitGamingApp`) with Marketing API + **Facebook Login for Business**.
2. Configuration **LeadOrbitConfig** (`1436209141980934`) — Connect Meta OAuth uses `config_id` (not consumer `scope` alone).
3. Facebook Login → Valid OAuth Redirect URIs includes `https://leadorbit-delta.vercel.app/api/v1/meta/oauth/callback` (and local if needed).
4. Configuration permissions should include: `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `business_management`, `leads_retrieval`.
5. Development mode: only roles added to the app/Business can connect. External unrelated users need App Review / Advanced Access — LeadOrbit will only list assets the authorized user can access.

---

## Demo steps

1. **Sign in** to LeadOrbit (org owner or member).
2. **Connect Meta** — Settings → Connect Meta (or Marketing → advanced Connect Meta).
3. Complete OAuth; **select ad account + Page**.
4. **Select Pixel** (website leads) and/or **Instant Form** (ON_AD). Save.
5. **Marketing → Launch with Meta (AI)**.
6. Choose destination (Website + Pixel or Instant Form). Enter offer, geo, budget, currency.
7. Continue → **Generate AI copy** → edit primary text / headline / CTA.
8. **Review** — confirm account, Page, destination, budget, creative.
9. Check “I confirm…”; leave **Enable spend** unchecked for PAUSED.
10. **Approve Meta launch** → expect HTTP **201** with `campaign_id`, `adset_id`, `ad_id` and status `created_paused`.
11. Open **Meta Ads Manager** (filter PAUSED) and verify campaign / ad set / ad exist and remain paused.
12. In Marketing → **Meta campaigns** panel: Refresh Meta status; Load insights (empty is normal for new/paused).

---

## Safety notes

- Default create status is **PAUSED**. ACTIVE requires a separate explicit checkbox.
- Partial failures persist Meta ids already created; Retry reuses campaign id and creates a new ad set (does not reuse a broken ad set).
- Tokens are never returned to the browser; ciphertext is service-role only.
- Website OUTCOME_LEADS requires a real Pixel + `promoted_object` (`page_id`, `pixel_id`, `custom_event_type: LEAD`). Instant Form uses `ON_AD` + `page_id` + form on the creative CTA.

---

## Known limitations

- Objective fixed to `OUTCOME_LEADS` (lead gen). Other Meta objectives are blocked, not silently remapped.
- Instagram identity selection is not implemented in this slice.
- Image creatives require a public URL Meta can fetch — local file upload to Meta is not claimed.
- Insights may be empty until delivery; LeadOrbit does not invent metrics.
- Unrelated external advertisers may fail OAuth until Meta App Review grants the required permissions.
