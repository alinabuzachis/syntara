#!/usr/bin/env bash
# Startup hook: reminds Claude about available project skills at session start.
set -euo pipefail

cat >&2 <<'MSG'
Available project skills — reference these when working on related areas:

  - .claude/skills/coding_standards.md        → code patterns, ESLint rules, shared hooks
  - .claude/skills/testing_guidelines.md      → coverage, vitest-axe, userEvent, accessible queries
  - .claude/skills/patternfly_ux_design_system.md → PF6 components, layout, styling, UX rules
  - .claude/skills/playwright_e2e.md          → E2E test conventions, fixtures, helpers
  - .claude/skills/pr_review.md               → PR review checklist and process
MSG
