#!/bin/bash
# Compare Snyk SCA results between base and PR branches
# Fail only on NEW HIGH/CRITICAL vulnerabilities introduced by the PR

set -euo pipefail

BASE_JSON="${1:-snyk-base.json}"
PR_JSON="${2:-snyk-pr.json}"

# Extract vulnerability IDs from base branch
if [ -f "$BASE_JSON" ]; then
  BASE_VULNS=$(jq -r '.vulnerabilities[]?.id // empty' "$BASE_JSON" | sort -u)
else
  BASE_VULNS=""
fi

# Extract HIGH/CRITICAL vulnerability IDs from PR branch
if [ -f "$PR_JSON" ]; then
  PR_HIGH_CRIT=$(jq -r '.vulnerabilities[]? | select(.severity == "high" or .severity == "critical") | .id' "$PR_JSON" | sort -u)
else
  PR_HIGH_CRIT=""
fi

# Find NEW vulnerabilities (in PR but not in base)
NEW_VULNS=$(comm -13 <(echo "$BASE_VULNS") <(echo "$PR_HIGH_CRIT"))

if [ -n "$NEW_VULNS" ] && [ "$NEW_VULNS" != "" ]; then
  echo "❌ NEW HIGH/CRITICAL vulnerabilities introduced by this PR:"
  echo ""
  for vuln_id in $NEW_VULNS; do
    jq -r --arg id "$vuln_id" \
      '.vulnerabilities[] | select(.id == $id) |
      "  - \(.packageName)@\(.version): \(.title)\n    Severity: \(.severity | ascii_upcase)\n    Fix: \(.upgradePath // ["No fix available"] | join(" -> "))\n"' \
      "$PR_JSON"
  done
  echo ""
  echo "These vulnerabilities were introduced by changes in this PR."
  echo "Please update the affected dependencies or document why the risk is acceptable."
  exit 1
else
  echo "✅ No new HIGH/CRITICAL vulnerabilities introduced by this PR"
  if [ -n "$BASE_VULNS" ] && [ "$BASE_VULNS" != "" ]; then
    echo ""
    echo "ℹ️  Note: Base branch has existing vulnerabilities (not blocking this PR)"
  fi
fi
