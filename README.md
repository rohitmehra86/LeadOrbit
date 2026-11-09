# LeadOrbit (Java)

AI Lead & Revenue Cloud — **Spring Boot 3 / Java 21**.

- **Connect Meta** (OAuth, Pixel save)
- **Marketing launch** → PAUSED Meta website lead campaigns
- **Public landing** `/p/{orgId}/{slug}` → leads in DB
- **Supabase Postgres** (production) or **H2** (local)

## Supabase (configured)

Project: **LeadOrbit** (`kqmuxocbmtydkxdvmypy`)  
API: `https://kqmuxocbmtydkxdvmypy.supabase.co`  
Region: `ap-northeast-1`

Java tables (already migrated): `lo_orgs`, `lo_meta_connections`, `lo_meta_oauth_pending`, `lo_landing_pages`, `lo_leads`, `lo_meta_launch_plans`  
SQL also lives in `supabase/migrations/`.

### Connect Spring to Supabase

1. Supabase Dashboard → **Project Settings → Database**
2. Copy the **database password** and build JDBC URL:

```bash
export SPRING_PROFILES_ACTIVE=supabase
export DATABASE_URL='jdbc:postgresql://db.kqmuxocbmtydkxdvmypy.supabase.co:5432/postgres?sslmode=require'
export DATABASE_USERNAME=postgres
export DATABASE_PASSWORD='YOUR_DB_PASSWORD'
export SUPABASE_URL=https://kqmuxocbmtydkxdvmypy.supabase.co
export SUPABASE_ANON_KEY='your-anon-or-publishable-key'
export APP_URL='https://your-public-host'
mvn spring-boot:run
```

> Use the **direct** DB host (`db.<ref>.supabase.co:5432`), not the pooler, unless you set the pooler username form `postgres.<ref>`.

## Run locally (H2)

```bash
mvn spring-boot:run
# http://127.0.0.1:43127
```

## Free hosts like Vercel (for Java)

Vercel does **not** fit Spring Boot. Use one of these free/hobby options:

| Host | Fit | Notes |
|------|-----|--------|
| **[Render](https://render.com)** | Best starter | Free web service + Docker; sleeps on idle. Use `render.yaml` in this repo. |
| **[Railway](https://railway.app)** | Easy | Hobby credit; connect GitHub, set env vars, deploy Dockerfile. |
| **[Fly.io](https://fly.io)** | Good | `fly.toml` included; free allowance / pay-as-you-go. |
| **[Google Cloud Run](https://cloud.google.com/run)** | Solid | Free tier; container; scales to zero. |
| **[Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)** | Always-free VM | Run the JAR on a small ARM VM if you want 24/7. |

### Deploy on Render (recommended free path)

1. Push this repo to GitHub
2. Render → **New → Blueprint** → select repo (`render.yaml`)
3. Set secrets: `DATABASE_URL`, `DATABASE_PASSWORD`, `APP_URL`, Meta keys, `SUPABASE_ANON_KEY`
4. Set Meta OAuth redirect to `https://<your-render-host>/api/v1/meta/oauth/callback`

### Deploy on Fly.io

```bash
fly launch   # or fly deploy with fly.toml
fly secrets set DATABASE_URL=... DATABASE_PASSWORD=... APP_URL=https://<app>.fly.dev
```

## Build / test

```bash
mvn -q test
mvn -q -DskipTests package
java -jar target/leadorbit-0.1.0-SNAPSHOT.jar
```

Health: `/api/v1/health` and `/actuator/health`

## Demo org

`33333333-3333-4333-8333-333333333333`

- Connect Meta → `/app/orgs/<orgId>/settings/meta-connect`
- Marketing → `/app/orgs/<orgId>/marketing`
- Leads → `/app/orgs/<orgId>/leads`
