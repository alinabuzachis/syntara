#!/usr/bin/env bash
# PostToolUse hook: reminds Claude to reference relevant skills based on the file being edited.
# Non-blocking — outputs a user-prompt reminder, never denies the action.
set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('file_path', ''))
" 2>/dev/null) || exit 0

[[ -z "$FILE_PATH" ]] && exit 0

REMINDERS=()

case "$FILE_PATH" in
  *e2e/*.spec.ts|*e2e/helpers/*|*e2e/utils/*)
    REMINDERS+=("Playwright E2E: .claude/skills/playwright_e2e.md")
    ;;
  *.test.tsx|*.test.ts)
    REMINDERS+=("Testing guidelines: .claude/skills/testing_guidelines.md")
    ;;
  *.tsx)
    REMINDERS+=("PatternFly UX: .claude/skills/patternfly_ux_design_system.md")
    REMINDERS+=("Coding standards: .claude/skills/coding_standards.md")
    ;;
  *.ts)
    REMINDERS+=("Coding standards: .claude/skills/coding_standards.md")
    ;;
  *.module.css)
    REMINDERS+=("PatternFly UX (styling rules): .claude/skills/patternfly_ux_design_system.md")
    ;;
esac

if [[ ${#REMINDERS[@]} -gt 0 ]]; then
  printf "Skills to reference:\n" >&2
  for r in "${REMINDERS[@]}"; do
    printf "  - %s\n" "$r" >&2
  done
fi
