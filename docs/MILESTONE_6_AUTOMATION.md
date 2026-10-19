# Milestone 6 — Workflow automation & unified communications

## Durable execution

| Role | Responsibility |
|------|----------------|
| `apps/web` | CRUD workflows/inbox; **enqueue only** (`SqliteJobQueue`) |
| `apps/worker` | Claim due jobs; run `workflow.tick` + `message.send` |

Shared SQLite path: repo-root `.data/leadorbit.sqlite` (override with `LEADORBIT_SQLITE_PATH`).

**Hard rule:** Workflow step execution and provider sends do **not** run inside Vercel/request handlers.

## Workflows

- Visual node graph (triggers + actions), draft/publish, versioning, test mode
- Enrollment pause/resume/cancel, step history, audit log
- Idempotent enroll + job keys; step retry → dead-letter
- Triggers dispatch from form submit / messaging webhooks (enqueue)

## Inbox

- Conversations across WhatsApp, Email, SMS, Website chat, Messenger, Instagram, Voice (scaffolding)
- History, assignment, unread, internal notes, tags, search, templates, attachments metadata, SLA, opt-out, consent flag, schedule-at enqueue
- Provider adapters: authorize stubs; outbound `pending_configuration` without credentials — never fake production delivery
- Signed inbound messaging webhooks

## Run locally

```bash
pnpm dev:web     # :43127
pnpm dev:worker  # polls SQLite queue
```

## Verified

- Unit: workflow graph, branch eval, messaging signatures, job idempotency/retry
- Store: workflow enroll+tick execution, inbox webhook security, outbound pending
- Not verified: live WhatsApp/Email/SMS provider HTTP, Postgres RLS
