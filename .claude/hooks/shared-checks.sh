#!/usr/bin/env bash
# Shared CI-mirroring checks used by pre-commit and pre-PR hooks.
# Expects PROJECT_ROOT and UI_DIR to be set by the caller.
# Appends failures to the ERRORS array.

# 1. Formatting (mirrors CI: npm run format:check)
echo "Running format check..." >&2
npm run format:check >&2 || {
  ERRORS+=("Formatting: run 'npm run format'")
}

# 2. TypeScript type check (mirrors CI: npm run tsc)
echo "Running TypeScript type check..." >&2
(cd "$UI_DIR" && npm run tsc) >&2 || {
  ERRORS+=("TypeScript: run 'cd packages/nexus-ui && npm run tsc'")
}

# 3. ESLint (mirrors CI: npm run lint)
echo "Running ESLint..." >&2
(cd "$UI_DIR" && npm run lint) >&2 || {
  ERRORS+=("ESLint: run 'cd packages/nexus-ui && npm run lint'")
}

# 4. Knip dead code detection (mirrors CI: npm run knip)
echo "Running knip dead code check..." >&2
(cd "$UI_DIR" && npm run knip) >&2 || {
  ERRORS+=("Dead code (knip): run 'cd packages/nexus-ui && npm run knip'")
}
