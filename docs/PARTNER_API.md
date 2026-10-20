# LeadOrbit Partner API (Wave 6)

Contract: [`packages/api-contracts/openapi/openapi.yaml`](../packages/api-contracts/openapi/openapi.yaml)

UI: **Developers** (`/app/orgs/{orgId}/developers`) · **Marketplace** (`/app/orgs/{orgId}/marketplace`)

## Outbound webhooks (LeadOrbit → Zapier / n8n)

1. Create a Catch Hook (Zapier) or Webhook node (n8n).
2. In Developers → add subscription with the HTTPS URL (http allowed only for `localhost` / `127.0.0.1`).
3. Store the returned `pwhsec_…` signing secret.
4. Emit a test — delivery is `delivered` **only** after remote HTTP 2xx.

### Signature

```
X-LeadOrbit-Timestamp: <unix seconds>
X-LeadOrbit-Signature: sha256=<hmac_sha256(secret, `${timestamp}.${rawBody}`)>
```

Payload envelope:

```json
{
  "id": "evt_…",
  "type": "lead.created",
  "orgId": "…",
  "occurredAt": "…",
  "data": {}
}
```

Retries: up to 3 attempts with exponential backoff, then `dead_letter`. Idempotent per `(subscription, event_id)`.

## Inbound partner webhooks (Zapier / n8n → LeadOrbit)

1. Developers → **Show inbound secret** (`piwhsec_…`).
2. POST to `/api/v1/public/partners/{orgId}/webhooks` with the same HMAC headers.
3. Include `X-LeadOrbit-Event-Id` (or JSON `id`) for idempotency.

Without a configured secret or with a bad signature → rejected. Never invents accept.

## Marketplace Launch Packs

Install industry templates into an org as a real draft Launch Pack (campaign + form + page). Optional publish. Does **not** claim live Meta/Google ads delivery.

## Honesty

- No fake integration “connected” states without credentials / HTTP success.
- Billing still activates only via verified Stripe/Razorpay webhooks.
- Linkbook project is out of scope.
