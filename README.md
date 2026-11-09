# LeadOrbit (Java)

AI Lead & Revenue Cloud — **Spring Boot 3 / Java 21** rewrite of the former TypeScript/Next.js stack.

## What it does

- **Connect Meta** — Facebook Login for Business OAuth per organization
- **Pixel / Instant Form assets** — list or paste IDs, save on the org connection
- **Marketing launch** — prepare a published landing page, approve to create a **PAUSED** Meta `OUTCOME_LEADS` website campaign
- **Public landing** — `/p/{orgId}/{slug}` form submits into the local H2 leads DB

## Run locally

```bash
# Java 21 + Maven
mvn spring-boot:run
```

App: [http://127.0.0.1:43127](http://127.0.0.1:43127)

### Environment

| Variable | Purpose |
|----------|---------|
| `META_ADS_APP_ID` | Meta app id |
| `META_ADS_APP_SECRET` | Meta app secret |
| `META_ADS_LOGIN_CONFIG_ID` | Login for Business config id |
| `META_ADS_OAUTH_REDIRECT_URI` | Optional; default `{app}/api/v1/meta/oauth/callback` |
| `NEXT_PUBLIC_APP_URL` / `leadorbit.app-url` | Public base URL for redirects & landing links |
| `PORT` | Server port (default `43127`) |

Copy Meta redirect URI into the Meta app:  
`https://<your-host>/api/v1/meta/oauth/callback`

## Build / test

```bash
mvn -q test
mvn -q -DskipTests package
java -jar target/leadorbit-0.1.0-SNAPSHOT.jar
```

## Demo org

Seeded org id: `33333333-3333-4333-8333-333333333333`

- Connect Meta: `/app/orgs/<orgId>/settings/meta-connect`
- Marketing: `/app/orgs/<orgId>/marketing`
- Leads: `/app/orgs/<orgId>/leads`
