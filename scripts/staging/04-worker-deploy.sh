#!/usr/bin/env bash
# Deploy apps/worker to Fly.io or Railway. Prefers LEADORBIT_WORKER_HOST=fly|railway.
set -euo pipefail
export PATH="${HOME}/.local/bin:${HOME}/.railway/bin:${HOME}/.fly/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

HOST="${LEADORBIT_WORKER_HOST:-}"
APP_NAME="${LEADORBIT_WORKER_APP:-leadorbit-worker}"

pick_host() {
  if [[ -n "$HOST" ]]; then
    echo "$HOST"
    return
  fi
  if command -v flyctl >/dev/null 2>&1 || command -v fly >/dev/null 2>&1; then
    FLY=$(command -v flyctl || command -v fly)
    if "$FLY" auth whoami >/dev/null 2>&1; then
      echo "fly"
      return
    fi
  fi
  if command -v railway >/dev/null 2>&1 && railway whoami >/dev/null 2>&1; then
    echo "railway"
    return
  fi
  echo ""
}

HOST="$(pick_host)"
if [[ -z "$HOST" ]]; then
  cat >&2 <<'EOF'
[worker] BLOCKED: no authenticated worker host.
  Set LEADORBIT_WORKER_HOST=fly|railway and provide:
    Fly:     FLY_API_TOKEN + flyctl installed
    Railway: RAILWAY_TOKEN / railway login
EOF
  exit 2
fi

echo "[worker] host=$HOST app=$APP_NAME"

case "$HOST" in
  fly)
    FLY=$(command -v flyctl || command -v fly)
    if ! "$FLY" auth whoami >/dev/null 2>&1; then
      echo "[worker] BLOCKED: fly not authenticated" >&2
      exit 2
    fi
    if ! "$FLY" apps list 2>/dev/null | grep -q "$APP_NAME"; then
      echo "[worker] creating fly app $APP_NAME"
      "$FLY" apps create "$APP_NAME" --org personal 2>/dev/null \
        || "$FLY" apps create "$APP_NAME"
    fi
    if [[ -f .env.staging.local ]]; then
      echo "[worker] importing secrets from .env.staging.local (values not printed)"
      # shellcheck disable=SC2046
      "$FLY" secrets set -a "$APP_NAME" $(
        grep -E '^[A-Z0-9_]+=.+' .env.staging.local \
          | grep -vE '^(#|$)' \
          | tr '\n' ' '
      ) || true
    else
      echo "[worker] WARN: no .env.staging.local — set fly secrets manually"
    fi
    "$FLY" deploy -c apps/worker/fly.toml -a "$APP_NAME"
    echo "[worker] fly deploy finished — verify: fly status -a $APP_NAME && curl \$WORKER_URL/health"
    ;;
  railway)
    if ! railway whoami >/dev/null 2>&1; then
      echo "[worker] BLOCKED: railway not authenticated" >&2
      exit 2
    fi
    if [[ ! -f apps/worker/railway.toml ]]; then
      echo "[worker] BLOCKED: missing apps/worker/railway.toml" >&2
      exit 2
    fi
    echo "[worker] linking/deploying via railway (project must exist or be created interactively)"
    (
      cd apps/worker
      railway up --detach || railway up
    )
    echo "[worker] railway up finished — verify service health URL before claiming success"
    ;;
  *)
    echo "[worker] BLOCKED: unknown host '$HOST' (use fly|railway)" >&2
    exit 2
    ;;
esac
