#!/usr/bin/env bash
# SessionStart hook: tells Claude about the skill-gate enforcement system.
set -euo pipefail

cat >&2 <<'MSG'
SKILL ENFORCEMENT ACTIVE: A PreToolUse hook will block your first edit to
each source file category (.ts, .tsx, .test.ts/.test.tsx, e2e/*.spec.ts,
e2e/helpers/*, e2e/utils/*) until you have read the required skill files.
The hook tells you exactly which files to read. This applies to all
contributors automatically.

Available skills (loaded on-demand per file type):
  - .claude/skills/frontend_specialist.md   (all source files)
  - .claude/skills/coding_standards.md      (all source files)
  - .claude/skills/patternfly-ux-design-system.md (.tsx components)
  - .claude/skills/testing_guidelines.md    (test files)
  - .claude/skills/playwright_e2e.md        (E2E specs, helpers, utils)
  - .claude/skills/pr_review.md             (before committing)
  - .claude/skills/library_references.md    (React, Zod, Zustand, etc.)
MSG
