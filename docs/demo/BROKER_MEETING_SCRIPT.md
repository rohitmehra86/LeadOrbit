# Broker meeting script (Rohit clicks · broker watches)

Demo on **https://leadorbit-delta.vercel.app** on Rohit’s laptop (fullscreen).  
Broker is non-technical — talk in site visits and buyers, not CRM jargon.

**Total:** ~2 min pitch + ~10–12 min click-through + close.

---

## Before the meeting (5 minutes)

1. Open Chrome/Safari → https://leadorbit-delta.vercel.app/api/v1/health  
   - Must show `"authMode":"supabase"` and `"status":"ok"`.  
   - If the page won’t load → see **Fallback (local)** at the bottom, or Redeploy steps in §7.
2. Open https://leadorbit-delta.vercel.app/login (fullscreen, hide bookmarks).  
3. Sign in:

| | |
|--|--|
| **Email** | `broker.friend@test.com` |
| **Password** | `DemoFriend-Vercel-2026!` |

4. Open workspace **Broker Friend Realty** (or go straight to):  
   https://leadorbit-delta.vercel.app/app/orgs/44444444-4444-4444-8444-444444444444/real-estate  
5. Bottom of sidebar → click **Advanced** (leave it on Advanced). Stay off **Expert**.

Leave the browser on **Real estate** before the broker sits down.

---

## 1. Two-minute pitch (say this)

> Brokers lose money in three places: **hot buyers who go cold**, **site visits that never get booked**, and **follow-ups that live in someone’s head or WhatsApp**.  
> LeadOrbit is not another heavy CRM. It’s a simple place to put your **projects and units**, catch a **buyer enquiry**, match them to inventory, and **book the site visit** so nothing falls through.  
> Today I’ll show you one path: project → enquiry → site visit → who to call next. If it feels useful, we put **one live project** on it for **seven days** — your team can try with real buyers.

---

## 2. Objection replies

| They say | You say |
|----------|---------|
| **“Excel is enough.”** | Excel lists units. It doesn’t remind you to book the visit or show which buyer matches which flat. When two people edit the sheet, someone still drops the ball. |
| **“My staff won’t use it.”** | We’re not asking them to learn twenty screens. One path: open Real estate, see the enquiry, book the visit. If they can use WhatsApp, they can do this. |
| **“Too expensive / complicated.”** | This meeting is only the simple path — no billing, no settings maze. Trial is **one project, seven days**. If it doesn’t save even one site visit, we stop. |
| **“WhatsApp is enough.”** | WhatsApp is great for chatting. It’s terrible as a memory for “who wanted 3BHK in Whitefield last Tuesday.” Here the enquiry and visit sit next to the project so you don’t dig chats. |

---

## 3. Ten–twelve minute click script (Vercel)

Stay on **Advanced**. One sentence per click.

| # | Click | Say |
|---|--------|-----|
| 1 | Sidebar bottom → **Advanced** (if not already) | “I’ll switch to the broker view — one extra menu for property work.” |
| 2 | Click **Real estate** | “This is where projects and buyers for site visits live — not a full CRM dump.” |
| 3 | Point at **module:enabled** (Enable only if needed) | “We turn on real estate only for this brokerage — optional, not forced on everyone.” |
| 4 | Scroll inventory / unit list (Horizon / Green Park / A-1201…) | “Here’s a sample project with flats and prices — same idea as your inventory sheet, but tied to buyers.” |
| 5 | Point at BHK / price / available | “When a buyer asks for 2–3 BHK in this area, we can match against these units.” |
| 6 | Sidebar → **Leads** (brief) | “Buyer walks in or calls — we capture them here so the name isn’t only in WhatsApp.” |
| 7 | Back to **Real estate** → enquiry area | “Enquiry = this buyer wants this kind of home — budget, location, BHK.” |
| 8 | Show Sneha / create enquiry (auto-match) | “See — it suggests matching units so you don’t scroll Excel while the buyer waits.” |
| 9 | **Site visit** → enquiry → time → address → Schedule | “Now we lock the site visit — date, place, which enquiry — so it doesn’t get forgotten.” |
| 10 | Sidebar → **Sales & Appointments** | “After the visit, this is who still needs a call — hot buyers don’t go cold quietly.” |
| 11 | Optional: **Leads** again | “Same person, from enquiry to visit — one thread, not five chats.” |
| 12 | Stop on Sales | “That’s the whole daily loop. No ads, no billing screens today.” |

Deep links if you get lost:

- Real estate: https://leadorbit-delta.vercel.app/app/orgs/44444444-4444-4444-8444-444444444444/real-estate  
- Leads: https://leadorbit-delta.vercel.app/app/orgs/44444444-4444-4444-8444-444444444444/leads  
- Sales: https://leadorbit-delta.vercel.app/app/orgs/44444444-4444-4444-8444-444444444444/sales  

---

## 4. What NOT to open

| Avoid | Why |
|-------|-----|
| **Settings** | Looks like homework |
| **Expert** mode | Billing, White label, Integrations |
| **Billing / White label** | Pricing too early |
| **Integrations** (Meta/Google) | “Connect” stubs look unfinished |
| **Marketplace / Developers / AI lab / Workflows / Inbox** | Distracting |
| Long AI Assistant chats | Easy to derail |

If they ask about ads: “Yes later — today only site visits and follow-ups.”

---

## 5. Closing ask

> Let’s put **one live project** of yours on this for **seven days**. Your coordinator adds units and logs a few real enquiries. If it doesn’t make site visits clearer, we tear it down — no long contract talk today.  
> Shall we pick the project name now, and I’ll send a short login tomorrow?

Write down: project name · who will try · WhatsApp.

---

## 6. Cheat sheet

1. Login `broker.friend@test.com` / `DemoFriend-Vercel-2026!`  
2. Advanced → Real estate  
3. Inventory → Enquiry → Site visit → Sales  
4. Ask: **one project · 7 days**

---

## 7. If Vercel is down before the meeting

### Quick check
- https://leadorbit-delta.vercel.app/api/v1/health won’t load, or login fails.

### Redeploy (Rohit — Vercel dashboard)

1. Vercel → project **leadorbit** only (domain `leadorbit-delta.vercel.app`).  
2. **Settings → General → Root Directory** = `apps/web`.  
3. **Settings → Environment Variables** (Production) — LeadOrbit Supabase **only** (`kqmuxocbmtydkxdvmypy`), never Linkbook:

| Variable | Value |
|----------|--------|
| `AUTH_MODE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kqmuxocbmtydkxdvmypy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | LeadOrbit anon |
| `SUPABASE_SERVICE_ROLE_KEY` | LeadOrbit service_role (server only) |
| `NEXT_PUBLIC_APP_URL` | `https://leadorbit-delta.vercel.app` |
| `CSRF_ALLOWED_ORIGINS` | `https://leadorbit-delta.vercel.app` |
| `CSRF_STRICT` | `1` |
| `SESSION_SECRET` | long random string |

4. **Deployments** → latest `main` → **Redeploy** (Production).  
5. Wait Ready → open health again → then login with broker account above.

### Fallback — local (only if Vercel still dead)

```bash
git clone https://github.com/rohitmehra86/LeadOrbit.git
cd LeadOrbit && pnpm install && pnpm local:demo
# second tab:
pnpm demo:seed
```

Login with the **broker** email/password printed in the terminal → Advanced → Real estate. Same say-this script. Do **not** mention localhost to the broker — say “our demo workspace.”
