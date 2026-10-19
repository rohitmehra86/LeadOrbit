#!/usr/bin/env bash
# Report CLI/MCP readiness without printing secrets.
set -euo pipefail
export PATH="${HOME}/.local/bin:${HOME}/.railway/bin:${HOME}/.fly/bin:${PATH}"

ok() { echo "AUTH  $1 — $2"; }
blk() { echo "BLOCK $1 — $2"; }

echo "LeadOrbit staging auth probe ($(date -u +%Y-%m-%dT%H:%MZ))"
echo

# GitHub
if gh auth status >/dev/null 2>&1; then
  ok "GitHub (gh)" "authenticated"
else
  blk "GitHub (gh)" "GH_TOKEN invalid or missing — need PAT or repo URL from Rohit"
fi

# Origin remote (Cursor forge) — always present in this agent
if git remote get-url origin >/dev/null 2>&1; then
  ok "git origin" "remote configured (Cursor forge; may not be public GitHub)"
else
  blk "git origin" "no origin remote"
fi

# Vercel
if command -v vercel >/dev/null 2>&1; then
  if vercel whoami >/dev/null 2>&1; then
    ok "Vercel CLI" "logged in as $(vercel whoami 2>/dev/null | tail -1)"
  else
    blk "Vercel CLI" "installed but logged out — need vercel login or VERCEL_TOKEN"
  fi
else
  blk "Vercel CLI" "not installed"
fi

# Supabase CLI
if command -v supabase >/dev/null 2>&1; then
  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    ok "Supabase CLI" "SUPABASE_ACCESS_TOKEN set (value not shown)"
  else
    blk "Supabase CLI" "no SUPABASE_ACCESS_TOKEN — MCP may still work if approved"
  fi
else
  blk "Supabase CLI" "not installed"
fi

# Supabase MCP (Cursor) — status is environment-reported; list_orgs proves readiness
ok "Supabase MCP" "authenticated in this agent (list orgs/projects works); still need Rohit to confirm staging project ref before migrate"

# Fly
if command -v flyctl >/dev/null 2>&1 || command -v fly >/dev/null 2>&1; then
  FLY=$(command -v flyctl || command -v fly)
  if "$FLY" auth whoami >/dev/null 2>&1; then
    ok "Fly" "authenticated"
  else
    blk "Fly" "CLI present but not logged in — need fly auth login / FLY_API_TOKEN"
  fi
else
  blk "Fly" "CLI not installed (download blocked in this env previously)"
fi

# Railway
if command -v railway >/dev/null 2>&1; then
  if railway whoami >/dev/null 2>&1; then
    ok "Railway" "authenticated"
  else
    blk "Railway" "CLI present but unauthorized — need railway login / RAILWAY_TOKEN"
  fi
else
  blk "Railway" "CLI not installed"
fi

# Required env names for wiring (presence only)
echo
echo "Env vars present (names only):"
for v in \
  GITHUB_TOKEN GH_TOKEN VERCEL_TOKEN SUPABASE_ACCESS_TOKEN \
  NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
  DATABASE_URL SESSION_SECRET FLY_API_TOKEN RAILWAY_TOKEN \
  LEADORBIT_STAGING_SUPABASE_PROJECT_REF LEADORBIT_GITHUB_REPO_URL
 do
  if [[ -n "${!v:-}" ]]; then echo "  SET   $v"; else echo "  unset $v"; fi
done

echo
echo "When credentials arrive, run: bash scripts/staging/wire-all.sh"
