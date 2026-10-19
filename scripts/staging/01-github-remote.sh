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

# Load agent-local token if present (never echoed)
if [[ -z "${GH_TOKEN:-}" && -f "${HOME}/.config/leadorbit-staging/gh_token" ]]; then
  GH_TOKEN="$(cat "${HOME}/.config/leadorbit-staging/gh_token")"
  export GH_TOKEN
fi
if [[ -z "${GITHUB_TOKEN:-}" && -n "${GH_TOKEN:-}" ]]; then
  export GITHUB_TOKEN="$GH_TOKEN"
fi

echo "[github] branch=$BRANCH remote=$REMOTE_NAME"

# Inject token into https://github.com URLs for push without printing
github_authed_url() {
  local url="$1"
  if [[ -z "${GH_TOKEN:-}" ]]; then
    echo "$url"
    return
  fi
  # Normalize to host/path then re-auth
  local rest="${url#https://}"
  rest="${rest#http://}"
  rest="${rest#*@}" # drop any embedded userinfo
  if [[ "$rest" == github.com/* ]]; then
    echo "https://x-access-token:${GH_TOKEN}@${rest}"
  else
    echo "$url"
  fi
}

github_clean_url() {
  local url="$1"
  local rest="${url#https://}"
  rest="${rest#http://}"
  rest="${rest#*@}"
  echo "https://${rest}"
}

if [[ -n "$TARGET_URL" ]]; then
  echo "[github] using provided LEADORBIT_GITHUB_REPO_URL (value not printed)"
  PUSH_URL="$(github_authed_url "$TARGET_URL")"
  CLEAN_URL="$(github_clean_url "$TARGET_URL")"
  if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
    git remote set-url "$REMOTE_NAME" "$CLEAN_URL"
  else
    git remote add "$REMOTE_NAME" "$CLEAN_URL"
  fi
  git push -u "$PUSH_URL" "refs/heads/${BRANCH}:refs/heads/${BRANCH}"
  git branch --set-upstream-to="$REMOTE_NAME/$BRANCH" "$BRANCH" 2>/dev/null || true
  echo "[github] pushed $BRANCH → $REMOTE_NAME"
  exit 0
fi

# gh needs api.github.com — detect egress early
if ! curl -sS -o /dev/null --max-time 8 -I https://api.github.com/ 2>/dev/null; then
  cat >&2 <<'EOF'
[github] BLOCKED: api.github.com is not reachable from this environment (egress).
  Token may still work for git push to github.com.
  Create an empty private repo in the GitHub UI, then set:
    export LEADORBIT_GITHUB_REPO_URL=https://github.com/<owner>/<repo>.git
  and re-run: bash scripts/staging/01-github-remote.sh
EOF
  exit 2
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
