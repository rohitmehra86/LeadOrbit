# Deploy LeadOrbit on Northflank (your host)

You are on **Northflank Hobby** (`rohit's workspace` / `tea-dboqkeff3r2c73c18qpg`).  
This is the configured free-tier host for the Java app (Vercel does not run Spring Boot).

## 1. Connect GitHub

1. Northflank → **Integrations** (or Account → Git) → connect **GitHub**
2. Allow access to **`rohitmehra86/LeadOrbit`**

## 2. Create a project

1. Left nav → **Projects** → **Create project**
2. Name: `leadorbit`
3. Region: pick one close to you (e.g. Europe or Asia if listed)

## 3. Create a combined service

1. In the project → **Create new** → **Service** → **Combined**
2. Name: `leadorbit-web`
3. **Repository:** `rohitmehra86/LeadOrbit` · branch **`main`**
4. **Build:** Dockerfile · path `/Dockerfile` · context `/`
5. **Networking:** public HTTP on port **8080** (detected from `EXPOSE 8080`)
6. **Resources:** smallest Hobby plan (512MB+ if available)

## 4. Runtime environment variables

Add these on the service (Runtime / Environment):

| Key | Value |
|-----|--------|
| `SPRING_PROFILES_ACTIVE` | `supabase` |
| `PORT` | `8080` |
| `DATABASE_URL` | `jdbc:postgresql://db.kqmuxocbmtydkxdvmypy.supabase.co:5432/postgres?sslmode=require` |
| `DATABASE_USERNAME` | `postgres` |
| `DATABASE_PASSWORD` | *(Supabase → Settings → Database)* |
| `SUPABASE_URL` | `https://kqmuxocbmtydkxdvmypy.supabase.co` |
| `SUPABASE_PROJECT_REF` | `kqmuxocbmtydkxdvmypy` |
| `SUPABASE_ANON_KEY` | *(Supabase → Settings → API → anon key)* |
| `APP_URL` | `https://<your-northflank-public-url>` *(set after first deploy)* |
| `META_ADS_APP_ID` | *(your Meta app)* |
| `META_ADS_APP_SECRET` | *(your Meta secret)* |
| `META_ADS_LOGIN_CONFIG_ID` | *(Login for Business config id)* |
| `META_ADS_OAUTH_REDIRECT_URI` | `https://<your-northflank-public-url>/api/v1/meta/oauth/callback` |

Database stays on **Supabase** (already migrated). Northflank only runs the Java container.

## 5. Deploy & verify

1. Click **Create service** — Northflank builds from `main` and deploys
2. Open `https://<public-url>/api/v1/health` — expect `"status":"ok"`
3. In Meta App → Valid OAuth Redirect URIs, add the callback URL above

## 6. Send back

Paste your public URL here (e.g. `https://leadorbit-web-….northflank.app`) so we can confirm health and Meta redirect.
