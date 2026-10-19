#!/usr/bin/env bash
# Create a private GitHub repo (if possible) or push current branch to a URL Rohit provides.
# Never invent credentials. Exits non-zero when blocked.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

REPO_NAME="${LEADORBIT_GITHUB_REPO_NAME:-leadorbit}"
REPO_VISIBILITY="${LEADORBIT_GITHUB_VISIBILITY:-private}"
TARGET_URL="${LEADORBIT_GITHUB_REPO_URL:-}"
REMOTE_NAME="${LEADORBIT_GITHUB_REMOTE:-github}"
BRANCH="$(git branch --show-current)"

echo "[github] branch=$BRANCH remote=$REMOTE_NAME"

if [[ -n "$TARGET_URL" ]]; then
  echo "[github] using provided LEADORBIT_GITHUB_REPO_URL (value not printed)"
  if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
    git remote set-url "$REMOTE_NAME" "$TARGET_URL"
  else
    git remote add "$REMOTE_NAME" "$TARGET_URL"
  fi
  git push -u "$REMOTE_NAME" "$BRANCH"
  echo "[github] pushed $BRANCH → $REMOTE_NAME"
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "[github] BLOCKED: need valid GH_TOKEN/GITHUB_TOKEN or LEADORBIT_GITHUB_REPO_URL" >&2
  exit 2
fi

OWNER="${LEADORBIT_GITHUB_OWNER:-$(gh api user -q .login 2>/dev/null || true)}"
if [[ -z "$OWNER" ]]; then
  echo "[github] BLOCKED: could not resolve GitHub owner" >&2
  exit 2
fi

FULL="$OWNER/$REPO_NAME"
echo "[github] ensuring $REPO_VISIBILITY repo $FULL"

if gh repo view "$FULL" >/dev/null 2>&1; then
  echo "[github] repo already exists"
else
  gh repo create "$FULL" --"$REPO_VISIBILITY" --source=. --remote="$REMOTE_NAME" --push=false
fi

URL="$(gh repo view "$FULL" --json url -q .url)"
if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$URL"
else
  git remote add "$REMOTE_NAME" "$URL"
fi

git push -u "$REMOTE_NAME" "$BRANCH"
echo "[github] DONE — $FULL (url not echoed with tokens)"
echo "[github] set LEADORBIT_GITHUB_REPO_URL for CI if needed"
