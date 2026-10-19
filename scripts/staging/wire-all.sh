#!/usr/bin/env bash
# Dependency-ordered staging wiring.
# Order: GitHub remote → Supabase migrations → Vercel web → worker host → status note.
# Safe by default: each step exits 2 when credentials missing. No invented secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STAGING="$ROOT/scripts/staging"

echo "============================================"
echo " LeadOrbit staging wire-all"
echo " $(date -u +%Y-%m-%dT%H:%MZ)"
echo "============================================"
echo

bash "$STAGING/00-check-auth.sh"
echo

step() {
  local n="$1" title="$2"
  echo
  echo ">>> STEP $n: $title"
}

step 1 "GitHub remote"
if [[ "${LEADORBIT_SKIP_GITHUB:-0}" == "1" ]]; then
  echo "[wire] skipped (LEADORBIT_SKIP_GITHUB=1)"
else
  bash "$STAGING/01-github-remote.sh"
fi

step 2 "Supabase link + migrations"
if [[ "${LEADORBIT_SKIP_SUPABASE:-0}" == "1" ]]; then
  echo "[wire] skipped (LEADORBIT_SKIP_SUPABASE=1)"
else
  # Default apply once Rohit has set the project ref + token
  export LEADORBIT_STAGING_MIGRATE_APPLY="${LEADORBIT_STAGING_MIGRATE_APPLY:-1}"
  bash "$STAGING/02-supabase-link-migrate.sh"
fi

step 3 "Vercel project + env"
if [[ "${LEADORBIT_SKIP_VERCEL:-0}" == "1" ]]; then
  echo "[wire] skipped (LEADORBIT_SKIP_VERCEL=1)"
else
  export LEADORBIT_VERCEL_DEPLOY="${LEADORBIT_VERCEL_DEPLOY:-1}"
  bash "$STAGING/03-vercel-link-env.sh"
fi

step 4 "Worker host (Fly/Railway)"
if [[ "${LEADORBIT_SKIP_WORKER:-0}" == "1" ]]; then
  echo "[wire] skipped (LEADORBIT_SKIP_WORKER=1)"
else
  bash "$STAGING/04-worker-deploy.sh"
fi

step 5 "Update IMPLEMENTATION_STATUS.md"
STAMP="$(date -u +%Y-%m-%d)"
NOTE="Staging wire-all executed ${STAMP} — verify live URLs before marking Verified."
if grep -q "Staging wire-all executed" IMPLEMENTATION_STATUS.md 2>/dev/null; then
  # replace prior stamp line if present
  sed -i "s/Staging wire-all executed.*/${NOTE}/" IMPLEMENTATION_STATUS.md || true
else
  printf '\n### Staging wiring run\n\n%s\n' "$NOTE" >> IMPLEMENTATION_STATUS.md
fi
echo "[wire] noted in IMPLEMENTATION_STATUS.md — review evidence before claiming deploys"

echo
echo "============================================"
echo " wire-all finished (check each step evidence)"
echo "============================================"
echo "Local services should still be running:"
echo "  Web:    http://127.0.0.1:43127"
echo "  Worker: http://127.0.0.1:43128/health"
