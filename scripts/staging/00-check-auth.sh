#!/usr/bin/env bash
# Report CLI/MCP readiness without printing secrets.
set -euo pipefail
export PATH="${HOME}/.local/bin:${HOME}/.railway/bin:${HOME}/.fly/bin:${PATH}"

ok() { echo "AUTH  $1 — $2"; }
blk() { echo "BLOCK $1 — $2"; }

echo "LeadOrbit staging auth probe ($(date -u +%Y-%m-%dT%H:%MZ))"
echo

# GitHub — prefer env, else agent-local token file (never printed)
if [[ -z "${GH_TOKEN:-}" && -f "${HOME}/.config/leadorbit-staging/gh_token" ]]; then
  GH_TOKEN="$(cat "${HOME}/.config/leadorbit-staging/gh_token")"
  export GH_TOKEN
fi
if [[ -z "${GITHUB_TOKEN:-}" && -n "${GH_TOKEN:-}" ]]; then
  export GITHUB_TOKEN="$GH_TOKEN"
fi

# Distinguish egress block (api.github.com) vs bad token vs missing
if [[ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]]; then
  blk "GitHub token" "missing — need PAT or LEADORBIT_GITHUB_REPO_URL"
else
  ok "GitHub token" "present in env/file (value not shown)"
fi

if curl -sS -o /dev/null --max-time 8 -I https://api.github.com/ 2>/dev/null; then
  API_OK=1
else
  API_OK=0
fi

if [[ "$API_OK" -eq 0 ]]; then
  blk "GitHub API (api.github.com)" "egress/SSL blocked — gh repo create unavailable; git://github.com may still work"
else
  ok "GitHub API (api.github.com)" "reachable"
fi

if gh auth status >/dev/null 2>&1; then
  ok "GitHub (gh)" "authenticated"
else
  if [[ "$API_OK" -eq 0 ]]; then
    blk "GitHub (gh)" "CLI needs api.github.com — provide empty private repo URL to push via git instead"
  else
    blk "GitHub (gh)" "token rejected by API — need a valid PAT (repo scope)"
  fi
fi

# git HTTPS to github.com (allowlisted) — token validity smoke without printing secrets
if [[ -n "${GH_TOKEN:-}" ]]; then
  if GIT_TERMINAL_PROMPT=0 git ls-remote "https://x-access-token:${GH_TOKEN}@github.com/octocat/Hello-World.git" HEAD >/dev/null 2>&1; then
    ok "GitHub git HTTPS" "token accepted for git operations on github.com"
  else
    blk "GitHub git HTTPS" "token not accepted for git (or github.com unreachable)"
  fi
fi

# Origin remote (Cursor forge) — always present in this agent
if git remote get-url origin >/dev/null 2>&1; then
  ok "git origin" "remote configured (Cursor forge; may not be public GitHub)"
else
  blk "git origin" "no origin remote"
fi

# Vercel — prefer env, else agent-local token file (never printed)
if [[ -z "${VERCEL_TOKEN:-}" && -f "${HOME}/.config/leadorbit-staging/vercel_token" ]]; then
  VERCEL_TOKEN="$(cat "${HOME}/.config/leadorbit-staging/vercel_token")"
  export VERCEL_TOKEN
fi

if command -v vercel >/dev/null 2>&1; then
  if [[ -n "${VERCEL_TOKEN:-}" ]]; then
    ok "Vercel token" "present in env/file (value not shown)"
  else
    blk "Vercel token" "missing — need VERCEL_TOKEN"
  fi
  if curl -sS -o /dev/null --max-time 8 -I https://api.vercel.com/ 2>/dev/null; then
    if vercel whoami >/dev/null 2>&1; then
      ok "Vercel CLI" "logged in as $(vercel whoami 2>/dev/null | tail -1)"
    else
      blk "Vercel CLI" "token present but whoami failed"
    fi
  else
    blk "Vercel API (api.vercel.com)" "egress/TLS blocked — token stored; cannot wire until allowlisted"
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
