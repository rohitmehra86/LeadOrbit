# Meta Ads setup (LeadOrbit)

Meta-first guided launch. Google Ads is out of scope for this slice.  
**Never silent spend** — Approve is required before Marketing API create.  
Without credentials, launches stay `pending_configuration` (draft only — never faked “live”).

## For Rohit — Meta Developer steps

1. Go to [developers.facebook.com](https://developers.facebook.com/) → **My Apps** → **Create App**.
2. Choose **Business** / type that supports **Marketing API**.
3. Add product **Marketing API**.
4. In **Meta Business Suite / Business Settings**:
   - Create or pick an **Ad Account** (note `act_…` id).
   - Pick the **Facebook Page** that will own ads (note Page ID).
   - Create a **System User**, assign Ad Account + Page assets with `ads_management` (and pages as needed).
   - Generate a **long-lived System User token**.
5. (Optional later) Configure **OAuth** redirect on the Meta App to your LeadOrbit domain; until then env token is enough.
6. Put secrets in **Vercel → Project → Settings → Environment Variables → Production** (names below). Redeploy after saving.

## Vercel env names (values from Meta — do not invent)

| Name | Purpose |
|------|---------|
| `META_ADS_APP_ID` | Meta App ID |
| `META_ADS_APP_SECRET` | Meta App Secret |
| `META_ADS_ACCESS_TOKEN` | Long-lived System User (or OAuth) token with ads_management |
| `META_ADS_AD_ACCOUNT_ID` | Ad account id (`act_123…` or numeric) |
| `META_ADS_PAGE_ID` | Page id for creatives / lead ads ownership |

Optional app URL (already used elsewhere): `NEXT_PUBLIC_APP_URL`.

## In-product flow

1. **Marketing (Simple)** → primary **Launch with Meta (AI)** (or Assistant: “Launch Meta ads for …”).
2. Enter essentials: business/offer, geo, budget, daily/lifetime, audience/copy optional.
3. LeadOrbit proposes plan + local published capture page.
4. **Approve / Edit / Cancel** — no Meta create until Approve.
5. **With credentials:** Graph API creates campaign / ad set / ad (`PAUSED` unless “Enable spend” checked).
6. **Without credentials:** draft saved; status `pending_configuration` + checklist to add `META_ADS_*`. Results never claim “ad is live”.

## Connect Meta UI

Hidden until **Show advanced tools** (or open the Meta AI wizard). Shows which env keys are set (boolean only) vs pending — never displays secret values.

## Friend / demo note

Live Meta publish is **owner-only** until Rohit connects Production env. Friends can run the guided flow and get honest drafts. See `/cursor/stores/self/docs/friend-access.md`.
