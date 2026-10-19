#!/usr/bin/env bash
# Apply Supabase SQL migrations in order.
# Requires: supabase CLI linked OR DATABASE_URL with psql.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"

mode="${1:-status}"

echo "[migrate] mode=$mode dir=$MIG_DIR"

list_migrations() {
  ls -1 "$MIG_DIR"/*.sql | sort
}

case "$mode" in
  status)
    echo "Pending/authored migrations:"
    list_migrations
    if [[ -n "${DATABASE_URL:-}" ]]; then
      echo "DATABASE_URL is set — can apply with: $0 apply"
    else
      echo "DATABASE_URL unset and supabase link not verified — apply blocked"
    fi
    ;;
  apply)
    if command -v supabase >/dev/null 2>&1 && supabase status >/dev/null 2>&1; then
      echo "[migrate] using supabase db push"
      supabase db push
      exit 0
    fi
    if [[ -z "${DATABASE_URL:-}" ]]; then
      echo "[migrate] ERROR: need supabase CLI linked project or DATABASE_URL" >&2
      exit 2
    fi
    if ! command -v psql >/dev/null 2>&1; then
      echo "[migrate] ERROR: psql not found" >&2
      exit 2
    fi
    for f in $(list_migrations); do
      echo "[migrate] applying $(basename "$f")"
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
    done
    echo "[migrate] done"
    ;;
  dry-run)
    for f in $(list_migrations); do
      echo "would apply: $(basename "$f")"
    done
    ;;
  *)
    echo "Usage: $0 {status|apply|dry-run}" >&2
    exit 1
    ;;
esac
