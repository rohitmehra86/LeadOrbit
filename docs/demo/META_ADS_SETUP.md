# Meta Ads setup (LeadOrbit)

Meta-first guided launch. Google Ads is out of scope for this slice.

**Never silent spend** — Approve is required before any Marketing API create.  
Without credentials, launches stay `pending_configuration` (draft only — never faked “live”).

---

## 1. Create a Meta Business app

1. Open [developers.facebook.com](https://developers.facebook.com/) → log in.
2. **My Apps** → **Create App**.
3. Choose a type that supports ads / **Business** (not a consumer-only toy app).
4. Name the app (e.g. `LeadOrbit Ads`) and create it.
5. Note **App ID** and **App Secret** (App settings → Basic). You will paste these into Vercel later — never into LeadOrbit UI fields.

---

## 2. Add Marketing API

1. In the app dashboard, find **Add products**.
2. Add **Marketing API**.
3. Keep the app in Development while testing with roles that have access to your ad account. For broad production use by other businesses, see [App review](#7-app-review-notes-production) below.

---

## 3. Ad account, Page, and System User token

In [Meta Business Suite → Business Settings](https://business.facebook.com/settings):

1. **Ad accounts** — create or select one. Copy the id (`act_123…` or numeric).
2. **Pages** — select the Facebook Page that will own ads. Copy **Page ID**.
3. **Users → System users** — create a System User (e.g. `leadorbit-ads`).
4. Assign assets:
   - Ad Account → permission that includes ads management
   - Page → appropriate page role for ads/creatives
5. **Generate token** for that System User:
   - Include `ads_management` (and page-related scopes as required by Meta for your creatives path)
   - Prefer a **long-lived** token
6. Store the token only in Vercel — never commit it, never put it in docs.

Optional later: OAuth redirect URI on the Meta App pointing at your LeadOrbit domain. Until then, the System User token is enough.

---

## 4. Vercel environment variables (exact names)

**Vercel → Project (leadorbit) → Settings → Environment Variables → Production**

| Name | What to paste |
|------|----------------|
| `META_ADS_APP_ID` | Meta App ID (**required** for Connect Meta OAuth) — LeadOrbitGamingApp: `1828424055013488` |
| `META_ADS_APP_SECRET` | Meta App Secret (**required**, server-only — never expose to the browser) |
| `META_ADS_LOGIN_CONFIG_ID` | Facebook Login for Business **User access token** configuration id (**required**) |
| `META_ADS_OAUTH_REDIRECT_URI` | Optional; default `{NEXT_PUBLIC_APP_URL}/api/v1/meta/oauth/callback` — production: `https://leadorbit-delta.vercel.app/api/v1/meta/oauth/callback` |
| `META_ADS_TOKEN_ENCRYPTION_KEY` | Recommended stable key for per-org token ciphertext |
| `META_ADS_ALLOW_ENV_FALLBACK` | Optional. Set `true` only for **platform demo** so env ACCESS_TOKEN can publish without Connect Meta. Default/off = industry standard (Connect Meta required) |
| `META_ADS_ACCESS_TOKEN` | Demo only (with `META_ADS_ALLOW_ENV_FALLBACK=true`) — System User token |
| `META_ADS_AD_ACCOUNT_ID` | Demo only (with env fallback) |
| `META_ADS_PAGE_ID` | Demo only (with env fallback) |
| `META_ADS_PIXEL_ID` | Optional assist for website leads — prefer Pixel in **Connect Meta** |
| `META_ADS_LEAD_GEN_FORM_ID` | Optional assist for Instant Form — prefer form in **Connect Meta** |

Also keep `NEXT_PUBLIC_APP_URL` set to your production URL (e.g. `https://leadorbit-delta.vercel.app`).

**Primary (industry standard):** customers use **Settings → Connect Meta** (Facebook Login for Business, User access token + `config_id`). Ads are created on **their** ad account. App Secret / tokens never go to the browser.  
Apply migration `00023_meta_connection_lead_assets.sql` for Pixel / Instant Form columns (manual — do not auto-apply).  
**Meta App → Facebook Login → Valid OAuth Redirect URIs** must include  
`https://leadorbit-delta.vercel.app/api/v1/meta/oauth/callback` (and localhost for dev).

**Login for Business configuration should grant at least:**  
`ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `business_management` (add `leads_retrieval` when Meta lists it).  
Do **not** include `catalog_management` unless you need Catalogues.

Do **not** invent values. Do **not** paste secrets into chat. Connect Meta stores the token encrypted server-side.

Full expert demo walkthrough: [`META_MARKETING_DEMO_CHECKLIST.md`](./META_MARKETING_DEMO_CHECKLIST.md).

---

## 5. Redeploy and test

1. After saving env vars → **Deployments** → **Redeploy** Production (turn **OFF** build cache).
2. Confirm Root Directory = `apps/web`.
3. Sign in as owner → **Marketing**.
4. Click **Launch with Meta (AI)** (not “Launch & publish (local)” — that is LeadOrbit-only).
5. Fill essentials → **Propose Meta plan** → review → **Approve Meta launch**.
6. Check Network for `POST .../meta/launch` with `"action":"approve"`:

| HTTP | Body `status` | Meaning |
|------|---------------|---------|
| **201** | `created_paused` / `created_active` | Meta created — Response includes `campaign_id`, `adset_id`, `ad_id` |
| **409** | `pending_configuration` | Env incomplete — Meta API **not** called |
| **502** | `error` | Meta API rejected the call — read `detail` |

7. Ads Manager: find the new campaign by name or `campaign_id` (include **PAUSED** in filters).

Connect Meta checklist (env key names only) appears under **Show advanced tools**.

---

## 6. In-product flow (recap)

1. Marketing Simple → **Launch with Meta (AI)** (or Assistant: “Launch Meta ads for …”).
2. Essentials: business/offer, geo, budget, daily/lifetime, audience/copy optional.
3. LeadOrbit proposes plan + local capture page.
4. **Approve / Edit / Cancel** — no Meta create until Approve.
5. Credentials present → Graph API create; missing → honest draft.

---

## 7. App review notes (production)

- **Development mode:** fine for you and roles added to the app/Business — enough to validate LeadOrbit → Marketing API.
- **Going live for other advertisers / public customers:** Meta may require **App Review** for Marketing API permissions, Business verification, and ads-related policies. Start that when you onboard external ad accounts; do not block your own System User test on review.
- Advanced Access / Standard Access rules change over time — follow Meta’s current Marketing API and App Review docs when you scale past owner-only use.

---

## Friend / demo note

Live Meta publish is **owner-only** until Production `META_ADS_*` is set. Friends can run the guided flow and get honest drafts. See `/cursor/stores/self/docs/friend-access.md` and `/cursor/stores/self/docs/meta-credentials-setup.md`.
