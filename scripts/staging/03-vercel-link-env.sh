#!/usr/bin/env bash
# Create/link a Vercel project for apps/web and push env vars from a file.
# Does not print secret values. Requires Vercel auth.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Default matches Rohit's Vercel UI name; override with LEADORBIT_VERCEL_PROJECT if needed.
PROJECT="${LEADORBIT_VERCEL_PROJECT:-leadorbit}"
ENV_FILE="${LEADORBIT_VERCEL_ENV_FILE:-.env.staging.local}"
SCOPE="${LEADORBIT_VERCEL_SCOPE:-}"
TARGET_ENV="${LEADORBIT_VERCEL_TARGET:-preview}" # preview|production|development

# Refuse accidental link to Linkbook Vercel project names
if [[ "$PROJECT" =~ [Ll]inkbook ]] && [[ "${LEADORBIT_ALLOW_LINKBOOK_VERCEL:-0}" != "1" ]]; then
  echo "[vercel] BLOCKED: project name '$PROJECT' looks like Linkbook (other session)." >&2
  echo "[vercel] Use LEADORBIT_VERCEL_PROJECT=leadorbit-web (or another LeadOrbit-only name)." >&2
  exit 2
fi

echo "[vercel] LeadOrbit project=$PROJECT target=$TARGET_ENV (isolated from Linkbook)"

if ! command -v vercel >/dev/null 2>&1; then
  echo "[vercel] BLOCKED: vercel CLI not installed" >&2
  exit 2
fi

if ! vercel whoami >/dev/null 2>&1; then
  echo "[vercel] BLOCKED: logged out — need vercel login or VERCEL_TOKEN" >&2
  exit 2
fi

LINK_ARGS=(--yes --project "$PROJECT")
if [[ -n "$SCOPE" ]]; then
  LINK_ARGS+=(--scope "$SCOPE")
fi

echo "[vercel] linking..."
vercel link "${LINK_ARGS[@]}"

# Required staging keys (presence check only)
REQUIRED=(
  SESSION_SECRET
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  AUTH_MODE
  NEXT_PUBLIC_APP_URL
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[vercel] BLOCKED: missing env file $ENV_FILE (copy from .env.staging.example)" >&2
  echo "[vercel] project linked; env push skipped" >&2
  exit 2
fi

missing=0
for k in "${REQUIRED[@]}"; do
  if ! grep -qE "^${k}=.+" "$ENV_FILE"; then
    echo "[vercel] missing or empty: $k"
    missing=1
  else
    echo "[vercel] present: $k"
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "[vercel] BLOCKED: fill required keys in $ENV_FILE (values not shown)" >&2
  exit 2
fi

echo "[vercel] uploading env vars from $ENV_FILE (values not printed)"
# vercel env pull/add is interactive for many keys; use `vercel env` bulk when available
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  [[ -z "$key" || "$key" == "$line" ]] && continue
  # Remove surrounding quotes if present
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  if [[ -z "$val" ]]; then
    continue
  fi
  # Force overwrite for idempotent re-runs; do not echo value
  printf '%s' "$val" | vercel env add "$key" "$TARGET_ENV" --force >/dev/null 2>&1 \
    || printf '%s' "$val" | vercel env add "$key" "$TARGET_ENV" >/dev/null
  echo "[vercel] set $key → $TARGET_ENV"
done < "$ENV_FILE"

if [[ "${LEADORBIT_VERCEL_DEPLOY:-0}" == "1" ]]; then
  echo "[vercel] deploying (LEADORBIT_VERCEL_DEPLOY=1)..."
  vercel deploy --yes ${LEADORBIT_VERCEL_PROD:+--prod}
  echo "[vercel] deploy command finished — verify URL in Vercel dashboard before claiming success"
else
  echo "[vercel] env ready; deploy skipped (set LEADORBIT_VERCEL_DEPLOY=1 to deploy)"
fi
