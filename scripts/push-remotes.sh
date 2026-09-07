#!/usr/bin/env bash
# Push main to GitHub and Cursor origin after each commit (via post-commit hook).
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"
remote_github="${IDEA_FORGE_GITHUB_REMOTE:-github}"
remote_origin="${IDEA_FORGE_ORIGIN_REMOTE:-origin}"

push_github() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git push "https://x-access-token:${GITHUB_TOKEN}@github.com/shankyleo/idea-forge.git" "${branch}"
    return
  fi
  if git remote get-url "${remote_github}" &>/dev/null; then
    git push -u "${remote_github}" "${branch}" 2>/dev/null && return
  fi
  echo "push-remotes: skipped GitHub (set GITHUB_TOKEN in Cloud Agent secrets)" >&2
}

push_origin() {
  if git remote get-url "${remote_origin}" &>/dev/null; then
    git push -u "${remote_origin}" "${branch}" 2>/dev/null || true
  fi
}

push_github || true
push_origin || true
