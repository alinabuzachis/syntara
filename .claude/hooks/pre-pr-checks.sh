#!/usr/bin/env bash
# PreToolUse hook: runs full CI checks before creating a PR.
# Mirrors the PR workflow: format, TypeScript, ESLint, knip, and unit tests.
# Outputs {"decision":"deny","reason":"..."} to block the PR on failure.
set -euo pipefail

INPUT=$(cat)

# Quick exit: only gate gh pr create commands (parse the actual command from JSON)
CMD=$(printf '%s' "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null) || exit 0
[[ "$CMD" =~ (^|[;&|])[[:space:]]*gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$) ]] || exit 0

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$PROJECT_ROOT"

UI_DIR="packages/nexus-ui"
ERRORS=()

# Run shared CI checks (format, tsc, lint, knip)
source "$(dirname "$0")/shared-checks.sh"

# 5. Unit tests (only vitest — format, tsc, lint already ran via shared-checks)
echo "Running unit tests..." >&2
(cd "$UI_DIR" && npm run vitest) >&2 || {
  ERRORS+=("Unit tests: run 'cd packages/nexus-ui && npm run vitest'")
}

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  DETAIL=$(printf '\n- %s' "${ERRORS[@]}")
  REASON="Pre-PR checks failed:${DETAIL}"
  REASON_JSON=$(python3 -c "import json, sys; print(json.dumps(sys.argv[1]))" "$REASON")
  echo "{\"decision\":\"deny\",\"reason\":${REASON_JSON}}"
fi
