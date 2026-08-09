#!/usr/bin/env bash
# PreToolUse/Bash hook: blocks any `git add`/`git commit` that would stage a
# .env file. Enforces spec §7.1 — secrets must never be committed.
set -euo pipefail

cmd="$(jq -r '.tool_input.command // empty')"

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# Case 1: the command itself is a `git add` referencing a .env file
# (e.g. `git add .env`, `git add -f .env`).
if printf '%s' "$cmd" | grep -Eq '(^|[;&|]\s*)git\s+add\b' \
   && printf '%s' "$cmd" | grep -Eq '(^|[[:space:]"'"'"'])\.env([[:space:]"'"'"']|$)'; then
  deny "Blocked: this git add command references .env, which must never be committed (spec section 7.1). Use .env.example instead."
fi

# Case 2: the command is a `git commit` and .env is currently staged
# (e.g. it was force-added earlier, or was tracked before .gitignore existed).
if printf '%s' "$cmd" | grep -Eq '(^|[;&|]\s*)git\s+commit\b'; then
  if git diff --cached --name-only 2>/dev/null | grep -Eq '(^|/)\.env$'; then
    deny "Blocked: .env is currently staged. Run: git restore --staged .env — secrets must never be committed (spec section 7.1)."
  fi
fi

exit 0
