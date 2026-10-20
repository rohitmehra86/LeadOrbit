# Friend demo — real estate broker (~15–20 min)

**App:** https://leadorbit-delta.vercel.app  
**Goal:** Inventory → enquiry → site visit → Sales. Separate org from the marketing friend.

---

## Option A — pre-seeded (fastest)

1. Open [Login](https://leadorbit-delta.vercel.app/login)  
2. Email: `broker.friend@test.com`  
3. Password: `DemoFriend-Vercel-2026!`  
4. Open workspace **Broker Friend Realty**  
5. Direct: https://leadorbit-delta.vercel.app/app/orgs/44444444-4444-4444-8444-444444444444/real-estate

## Option B — own account

1. [Signup](https://leadorbit-delta.vercel.app/signup) with a **different** email than marketing  
2. Create workspace e.g. `Whitefield Brokers`  
3. Continue from step 1 below

---

## Click path

1. Sidebar bottom → **Advanced** (or Expert) → **Real estate** appears first.

2. **Enable** real estate / select Real estate template (seeded org already enabled).

3. **Inventory**  
   - Seeded: Horizon Developers → Green Park Residences → 3 units.  
   - Own account: use **Quick seed inventory** on the page (developer → project → unit).

4. **Enquiry**  
   - Seeded: buyer **Sneha Rao** + matched enquiry.  
   - Or: Leads → add buyer → Real estate → preferences → **Create enquiry (auto-match)**.

5. **Site visit**  
   - On Real estate → Site visit form → pick enquiry → date/time → address → book.  
   - If no appointment type exists, the UI creates a **Site visit** type automatically.

6. Sidebar → **Sales & Appointments** → see hot leads / follow-ups; calendar link for visits.

---

## What works on Vercel

- Separate org from marketing friend  
- Durable RE module (Supabase): enable, inventory, prefs, enquiry, match, site visit appointments  
- Leads + Sales surfaces  

## Blocked / needs credentials

| Feature | Status |
|---------|--------|
| Meta / Google lead ads | Needs ad credentials |
| WhatsApp / SMS | Needs messaging providers |
| Full Calendar OAuth | Pending provider keys |

Do **not** share the marketing friend’s login — each persona has its own org.
