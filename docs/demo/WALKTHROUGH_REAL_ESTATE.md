# Friend demo — real estate broker (~15–20 min)

**Goal:** Inventory → buyer enquiry → qualify → site visit → Sales.  
**Use local:** `pnpm local:demo` → http://127.0.0.1:43127  
**Optional seed:** `pnpm demo:seed` then login with Broker account from `.data/demo-seed.json` (project + enquiry + visit already created).

---

## Click path

1. **Signup / login**  
   - `/signup` with a **different** email than the marketing friend  
   - Or `/login` with seeded Broker Demo account  

2. **Create workspace**  
   - e.g. `Whitefield Brokers` → open org  

3. **Switch UX mode**  
   - Bottom of sidebar → **Advanced** or **Expert**  
   - **Real estate** link appears (first under Advanced)  

4. **Enable Real estate**  
   - Open **Real estate** → enable template / module if prompted  

5. **Inventory**  
   - Add developer → project (city/location) → property → units (BHK, price)  
   - Seeded org already has *Horizon Developers / Green Park Residences* + 3 units  

6. **Lead + enquiry**  
   - **Leads** → add buyer (or use seeded *Sneha Rao*)  
   - Back in **Real estate** → set buyer preferences (budget, BHK, location) → create enquiry (auto-match units)  

7. **Qualify**  
   - Review matches on the enquiry; move lead stage on **Leads** if you want a “qualified” signal  

8. **Site visit**  
   - On enquiry → schedule **Site visit** (needs a site_visit appointment type — seed creates one)  
   - Or **Sales & Appointments** → book visit with address  

9. **Sales**  
   - Sidebar → **Sales & Appointments** → see the visit / pipeline  

---

## What works (local)

- Separate org from marketing friend (no shared leads)  
- RE module enable, inventory CRUD, preferences, enquiry + match  
- Site visit scheduling (calendar type + RE console)  
- Leads + Sales surfaces  

## Blocked / needs credentials

| Feature | Status |
|---------|--------|
| Meta / Google lead ads into RE | Needs ad credentials |
| Live WhatsApp / SMS | Needs messaging providers |
| Payments / brokerage payouts | Not wired for friend demos |
| Vercel + Supabase | Prefer local `pnpm local:demo` |

## Tip

Do **not** reuse the marketing friend’s login — each person needs their own org.
