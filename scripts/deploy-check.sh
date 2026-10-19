#!/usr/bin/env bash
# Pre-deploy go/no-go checks. Does not deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

check() {
  local name="$1" ok="$2" detail="$3"
  if [[ "$ok" == "1" ]]; then
    echo "PASS  $name — $detail"
  else
    echo "FAIL  $name — $detail"
    fail=1
  fi
}

echo "LeadOrbit deploy-check (env=${LEADORBIT_ENV:-unset})"

[[ -n "${SESSION_SECRET:-}" && "$SESSION_SECRET" != "change-me"* ]] && s=1 || s=0
check "SESSION_SECRET" "$s" "must be set to a strong non-default value for staging/prod"

if [[ "${AUTH_MODE:-}" == "supabase" ]]; then
  [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" && -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]] && s=1 || s=0
  check "Supabase public keys" "$s" "URL + anon key"
  [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] && s=1 || s=0
  check "Supabase service role" "$s" "server-only"
else
  check "AUTH_MODE" 1 "local — ok for development only"
fi

[[ "${LEADORBIT_ENV:-}" == "production" && "${AUTH_MODE:-}" == "local" ]] && s=0 || s=1
check "prod auth mode" "$s" "production must not use AUTH_MODE=local"

command -v pnpm >/dev/null && s=1 || s=0
check "pnpm" "$s" "package manager"

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  check "Vercel token" 1 "present (deploy attempt possible)"
else
  check "Vercel token" 0 "VERCEL_TOKEN unset — deploy blocked"
fi

if [[ -n "${DATABASE_URL:-}" ]] || [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  check "Database target" 1 "DATABASE_URL or Supabase URL present"
else
  check "Database target" 0 "no remote DB configured"
fi

exit $fail
