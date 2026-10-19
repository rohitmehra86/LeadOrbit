#!/usr/bin/env bash
# One-command LeadOrbit local demo (AUTH_MODE=local, SQLite).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WEB_PORT="${LEADORBIT_WEB_PORT:-43127}"
WORKER_PORT="${LEADORBIT_WORKER_PORT:-43128}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need node
need pnpm

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Node 22+ required (found $(node -v))" >&2
  exit 1
fi

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

mkdir -p .data
export AUTH_MODE=local
export LEADORBIT_SQLITE_PATH="${LEADORBIT_SQLITE_PATH:-$ROOT/.data/leadorbit.sqlite}"

echo "==> Starting worker on :$WORKER_PORT"
pnpm --filter @leadorbit/worker dev &
WORKER_PID=$!

cleanup() {
  kill "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting web on http://127.0.0.1:$WEB_PORT"
pnpm --filter @leadorbit/web exec next dev --turbopack --hostname 127.0.0.1 --port "$WEB_PORT" &
WEB_PID=$!

for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$WEB_PORT/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:$WEB_PORT/api/v1/health"; then
  echo "Web failed to become healthy" >&2
  exit 1
fi
echo
echo
echo "LeadOrbit local demo is ready"
echo "  App:    http://127.0.0.1:$WEB_PORT"
echo "  Signup: http://127.0.0.1:$WEB_PORT/signup"
echo "  Login:  http://127.0.0.1:$WEB_PORT/login"
echo "  Health: http://127.0.0.1:$WEB_PORT/api/v1/health"
echo
echo "Use any email + password on /signup (AUTH_MODE=local)."
echo "Press Ctrl+C to stop."

wait
