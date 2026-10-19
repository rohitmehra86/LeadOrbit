#!/usr/bin/env bash
# Link a Supabase project (explicit ref only) and apply migrations.
# Does NOT guess which existing project is staging — Rohit must set the ref.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

REF="${LEADORBIT_STAGING_SUPABASE_PROJECT_REF:-}"
DB_URL="${DATABASE_URL:-}"

echo "[supabase] staging link + migrate"

if [[ -z "$REF" && -z "$DB_URL" ]]; then
  cat >&2 <<'EOF'
[supabase] BLOCKED: set one of:
  LEADORBIT_STAGING_SUPABASE_PROJECT_REF=<project-ref>
  DATABASE_URL=postgresql://...   (staging only)

Do not assume an existing MCP-visible project is staging until Rohit confirms.
EOF
  exit 2
fi

if [[ -n "$REF" ]]; then
  if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] && ! supabase projects list >/dev/null 2>&1; then
    echo "[supabase] BLOCKED: CLI needs SUPABASE_ACCESS_TOKEN or supabase login" >&2
    echo "[supabase] tip: MCP may still apply migrations if Rohit confirms project ref" >&2
    exit 2
  fi
  echo "[supabase] linking project-ref=$REF"
  supabase link --project-ref "$REF" --yes
fi

echo "[supabase] dry-run of migration files:"
./scripts/migrate.sh dry-run

if [[ "${LEADORBIT_STAGING_MIGRATE_APPLY:-0}" != "1" ]]; then
  echo "[supabase] migrations listed but NOT applied."
  echo "[supabase] set LEADORBIT_STAGING_MIGRATE_APPLY=1 to apply after confirmation."
  exit 0
fi

./scripts/migrate.sh apply
echo "[supabase] migrations applied (verify via supabase migration list / MCP list_migrations)"
