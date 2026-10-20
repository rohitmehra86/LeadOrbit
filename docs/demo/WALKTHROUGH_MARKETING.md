# Friend demo — digital marketing expert (~15 min)

**App:** https://leadorbit-delta.vercel.app  
**Goal:** Open a published capture page, submit a lead, see it in Leads + Results.

---

## Option A — pre-seeded (fastest)

1. Open [Login](https://leadorbit-delta.vercel.app/login)  
2. Email: `marketing.friend@test.com`  
3. Password: `DemoFriend-Vercel-2026!`  
4. Open workspace **Marketing Friend Agency**

## Option B — own account

1. [Signup](https://leadorbit-delta.vercel.app/signup) with **your** email  
2. Create workspace e.g. `Acme Growth`  
3. Continue from step 3 below (you’ll create the Launch Pack yourself)

---

## Click path

Keep mode **Simple** (bottom of sidebar — default).

1. Sidebar → **Marketing**  
   - Pre-seeded: campaign **Generate qualified inbound leads** with a short landing name + **Copy link**.  
   - Or use **Launch Pack** on the page (goal → Launch & publish).  
   - Own account: same Launch Pack, or AI Assistant → *“Create a lead gen Launch Pack and publish it”*.

2. **Public capture page** (pre-seeded):  
   https://leadorbit-delta.vercel.app/p/33333333-3333-4333-8333-333333333333/launch-friend-demo  
   - Fill **Full name**, **Work email**, check **I agree to be contacted** → Continue / Submit  
   - Own account: use **Copy link** on the campaign row (shows page name, not a raw UUID path).

3. Sidebar → **Leads** → new contact appears (plus sample leads on seeded org).

4. Sidebar → **Results** (or Marketing → View Results).

Ad channels / creative library stay under **Advanced** — they never fake Meta/Google as connected.

---

## What works on Vercel

- Signup/login (needs `SUPABASE_SERVICE_ROLE_KEY` on the Vercel project for auto-confirm)  
- Org create, Launch Pack via campaign store (durable Supabase)  
- Public published page → form submit → lead  
- Leads + Results UI  

## Blocked / needs credentials

| Feature | Status |
|---------|--------|
| Meta / Google ads | Connect stubs — need real tokens |
| Live ad spend on Results | Pending integrations |
| Email confirmation without service_role | Set `SUPABASE_SERVICE_ROLE_KEY` on Vercel |

If login fails, open [health](https://leadorbit-delta.vercel.app/api/v1/health) — must show `"authMode":"supabase"`.
