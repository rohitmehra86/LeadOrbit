# Deploy LeadOrbit on Render (recommended)

**Choice: [Render](https://render.com)** — free Docker web service, GitHub auto-deploy, closest Vercel-like flow for Spring Boot.

## One-time setup

1. Sign up at [https://dashboard.render.com](https://dashboard.render.com) with GitHub.
2. Connect the repo **`rohitmehra86/LeadOrbit`** (Account → Git providers).
3. **New → Blueprint** → select `LeadOrbit` → use root `render.yaml` → Apply.
4. When prompted for secrets, set:

| Key | Value |
|-----|--------|
| `APP_URL` | `https://leadorbit.onrender.com` (or the URL Render shows after first deploy) |
| `DATABASE_URL` | `jdbc:postgresql://aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&prepareThreshold=0` |
| `DATABASE_USERNAME` | `postgres.kqmuxocbmtydkxdvmypy` |
| `DATABASE_PASSWORD` | Supabase → Project Settings → Database → password |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` / publishable key |

> Use the **pooler** URL above (not `db.*.supabase.co:5432`). Render free is IPv4-only; the direct DB host often fails with exit status 1.
| `META_ADS_APP_ID` | Meta app id |
| `META_ADS_APP_SECRET` | Meta app secret |
| `META_ADS_LOGIN_CONFIG_ID` | Login for Business config id |
| `META_ADS_OAUTH_REDIRECT_URI` | `https://<your-render-host>/api/v1/meta/oauth/callback` |

5. After deploy, open `https://<service>.onrender.com/api/v1/health`.
6. In Meta App → Facebook Login → Valid OAuth Redirect URIs, add the same callback URL.

## Notes

- Free tier **sleeps after ~15 min idle**; first request can take ~1 minute.
- Auto-deploys on every push to `main`.
- Database is **Supabase** (already migrated); Render only runs the Java app.

## Local check before deploy

```bash
mvn -q -DskipTests package
docker build -t leadorbit .
```
