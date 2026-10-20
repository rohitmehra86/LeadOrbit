# Broker meeting script (Rohit’s laptop)

For a **non-technical real estate broker** who dislikes software.  
Demo on **your Mac** with local LeadOrbit — keep it short, talk in broker words.

**Total talk time:** ~2 min pitch + ~10–12 min live click-through + close.

---

## 1. Two-minute pitch (say this)

> Brokers lose money in three places: **hot buyers who go cold**, **site visits that never get booked**, and **follow-ups that live in someone’s head or WhatsApp**.  
> LeadOrbit is not another heavy CRM. It’s a simple place to put your **projects and units**, catch a **buyer enquiry**, match them to inventory, and **book the site visit** so nothing falls through.  
> Today I’ll show you one path: project → enquiry → site visit → who to call next. If it feels useful, we put **one live project** on it for **seven days** — your team can try with real buyers.

---

## 2. Objection replies (keep calm, short)

| They say | You say |
|----------|---------|
| **“Excel is enough.”** | Excel lists units. It doesn’t remind you to book the visit or show which buyer matches which flat. When two people edit the sheet, someone still drops the ball. |
| **“My staff won’t use it.”** | We’re not asking them to learn twenty screens. One path: open Real estate, see the enquiry, book the visit. If they can use WhatsApp, they can do this. |
| **“Too expensive / complicated.”** | This meeting is only the simple path — no billing, no settings maze. Trial is **one project, seven days**. If it doesn’t save even one site visit, we stop. |
| **“WhatsApp is enough.”** | WhatsApp is great for chatting. It’s terrible as a memory for “who wanted 3BHK in Whitefield last Tuesday.” Here the enquiry and visit sit next to the project so you don’t dig chats. |

---

## 3. Exact Mac setup (before the meeting)

Do this **once**, then leave the browser open on the Real estate page.

```bash
# Need Node 22+ and pnpm 10+
git clone https://github.com/rohitmehra86/LeadOrbit.git
cd LeadOrbit
pnpm install
pnpm local:demo
```

In a **second** Terminal tab (after the app says ready):

```bash
cd LeadOrbit   # same folder
pnpm demo:seed
```

- App opens at **http://127.0.0.1:43127**  
- Seed prints two logins — use the **Demo Realty Brokers** / broker email + password from the terminal (or `.data/demo-seed.json`).  
- Browser → http://127.0.0.1:43127/login → paste broker email/password → open the brokerage org.

If the server was restarted, run `pnpm demo:seed` again (local memory resets).

**Do not** use Vercel for this meeting unless you already confirmed it is healthy.

---

## 4. Ten–twelve minute click script (say one line per step)

Stay on **Advanced** (not Expert). Smile. Don’t apologize for the UI.

| # | Click | Say |
|---|--------|-----|
| 1 | Bottom of left sidebar → **Advanced** | “I’ll switch to the broker view — one extra menu for property work.” |
| 2 | Click **Real estate** | “This is where projects and buyers for site visits live — not a full CRM dump.” |
| 3 | Point at **module:enabled** / Enable if needed | “We turn on real estate only for this brokerage — optional, not forced on everyone.” |
| 4 | Scroll to inventory / quick seed list (developer, project, units) | “Here’s a sample project with flats and prices — same idea as your inventory sheet, but tied to buyers.” |
| 5 | Point at unit rows (BHK / price / available) | “When a buyer asks for 2–3 BHK in this area, we can match against these units.” |
| 6 | Sidebar → **Leads** (briefly) | “Buyer walks in or calls — we capture them here so the name isn’t only in WhatsApp.” |
| 7 | Back to **Real estate** → enquiry section | “Enquiry = this buyer wants this kind of home — budget, location, BHK.” |
| 8 | Show existing enquiry / create enquiry (auto-match) | “See — it suggests matching units so you don’t scroll Excel while the buyer waits.” |
| 9 | **Site visit** form → pick enquiry → time → address → book | “Now we lock the site visit — date, place, which enquiry — so it doesn’t get forgotten.” |
| 10 | Sidebar → **Sales & Appointments** | “After the visit, this is who still needs a call or follow-up — hot buyers don’t go cold quietly.” |
| 11 | Optional: **Leads** again, point at the buyer | “Same person, from enquiry to visit — one thread, not five chats.” |
| 12 | Stop. Close laptop lid halfway or stay on Sales | “That’s the whole daily loop. No ads, no billing screens today.” |

Aim for **~1 minute per step**. If they lean in, linger on site visit. If they look bored, skip Leads (steps 6 and 11).

---

## 5. What NOT to open

| Avoid | Why |
|-------|-----|
| **Settings** | Looks like “setup work” — kills the mood |
| **Expert** mode | Extra menus (Billing, White label, Integrations) |
| **Billing / White label** | Pricing conversation too early |
| **Integrations** (Meta, Google) | Shows “Connect” stubs — looks unfinished |
| **Marketplace / Developers** | Too technical |
| **AI lab / Workflows / Inbox** | Distracting for this audience |
| Long AI Assistant chats | Easy to derail; one path only |

If they ask “Can it do ads?” → “Yes later — today we’re only proving site visits and follow-ups.”

---

## 6. Closing ask (say this)

> Let’s put **one live project** of yours on this for **seven days**. Your coordinator adds units and logs a few real enquiries. If it doesn’t make site visits clearer, we tear it down — no long contract talk today.  
> Shall we pick the project name now, and I’ll send a short login tomorrow?

Write down: project name, who on their team will try it, WhatsApp for follow-up.

---

## Cheat sheet (if you blank)

1. Advanced → Real estate  
2. Inventory (project + units)  
3. Enquiry + match  
4. Book site visit  
5. Sales / Leads  
6. Ask for **one project · 7 days**
