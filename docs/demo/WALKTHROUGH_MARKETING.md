# Friend demo — digital marketing expert (~15 min)

**Goal:** Launch a lead-gen pack, publish a page, capture a lead, open Results.  
**Use local:** `pnpm local:demo` → http://127.0.0.1:43127  
**Optional seed:** `pnpm demo:seed` then login with Marketing account from `.data/demo-seed.json`.

---

## Click path

1. **Signup / login**  
   - Open `/signup` → any email + password → Create account  
   - Or `/login` with seeded Marketing Demo email/password  

2. **Create workspace** (if empty)  
   - Name e.g. `Acme Growth` → open the org  

3. **Open Marketing** (sidebar)  
   - Or AI Assistant: ask *“Install the general lead gen Launch Pack and publish it”*  

4. **Launch Pack / Marketplace**  
   - Install **General lead gen** (or use Marketplace → General lead gen → Install + publish)  
   - You get a campaign + form + public page  

5. **Open the public page**  
   - Copy the `/p/...` link from Marketing  
   - Open in a new tab → fill **Full name**, **Work email**, check **I agree to be contacted** → Submit  

6. **Leads**  
   - Sidebar → **Leads** → new contact appears  

7. **Results**  
   - Sidebar → **Results** → see funnel / lead activity  

---

## What works (local)

- Signup, org create, Launch Pack install + publish  
- Public capture form → lead in CRM  
- Marketing console, Leads list, Results UI  
- Seeded sample leads if you ran `pnpm demo:seed`

## Blocked / needs credentials

| Feature | Status |
|---------|--------|
| Meta / Facebook Lead Ads | Needs Meta app + tokens (Integrations) |
| Google Ads spend / sync | Needs Google credentials |
| Live ad spend on Results | Pending real integrations |
| Vercel + Supabase signup | May fail if env incomplete — use local |

## Tip

Keep the sidebar on **Simple**. No Real estate needed for this path.
