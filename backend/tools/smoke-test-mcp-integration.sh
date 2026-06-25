#!/usr/bin/env bash
# smoke-test-mcp-integration.sh
#
# End-to-end smoke test for the MCP integration flow.
# Assumes all services are already running (make build-images && make run-all).
#
# Prerequisites:
#   - jq, curl installed
#   - API running on port 8000
#   - Run from the project root: ./tools/smoke-test-mcp-integration.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

# ─── Logging ─────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log()     { echo -e "${BLUE}▶${RESET} $*"; }
ok()      { echo -e "${GREEN}✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
fail()    { echo -e "${RED}✗${RESET} $*" >&2; }
section() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${RESET}"; }
hr()      { echo -e "${CYAN}────────────────────────────────────────${RESET}"; }
pretty()  { echo "$1" | jq '.' 2>/dev/null || echo "$1"; }

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_URL="${APP_BASE_URL:-http://localhost:8000}"
API="${BASE_URL}/api/v1"
MCP_PORT="${MCP_PORT:-8765}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(cat .secrets/admin-password 2>/dev/null || echo '')}"

# ─── Step 1: Authenticate ────────────────────────────────────────────────────

section "Step 1: Authenticate as admin"
if [[ -z "$ADMIN_PASSWORD" ]]; then
    fail "ADMIN_PASSWORD not set and .secrets/admin-password not found"
    exit 1
fi
log "Logging in..."
LOGIN_RESP=$(curl -sf -X POST "${API}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"admin\", \"password\": \"${ADMIN_PASSWORD}\"}")
JWT="$(echo "$LOGIN_RESP" | jq -r '.access_token')"
if [[ -z "$JWT" || "$JWT" == "null" ]]; then
    fail "Login failed. Response:"
    pretty "$LOGIN_RESP"
    exit 1
fi
ok "Logged in, JWT acquired"
AUTH_HEADER="Authorization: Bearer ${JWT}"

# Helper: authenticated GET
api_get() {
    curl -sf "${API}${1}" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json"
}

# Helper: authenticated POST
api_post() {
    local path="$1"
    local body="$2"
    curl -sf -X POST "${API}${path}" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "$body"
}

# Helper: find an existing credential by name, or create it.
# Usage: ensure_credential <name> <json-body>
# Prints the credential JSON to stdout.
# NOTE: only emit JSON to stdout — no warn/log calls here, as this runs inside
# $() and any stderr output leaks into the captured variable in some environments.
ensure_credential() {
    local name="$1"
    local body="$2"
    local existing
    existing=$(api_get "/credentials" | jq --arg n "$name" '.resources[] | select(.name == $n)' | jq -s '.[0] // empty')
    if [[ -n "$existing" && "$existing" != "null" ]]; then
        echo "$existing"
    else
        api_post "/credentials" "$body"
    fi
}

# Helper: find an existing integration by name, or create it.
# Usage: ensure_integration <name> <json-body>
# Prints the integration JSON to stdout.
# NOTE: only emit JSON to stdout — no warn/log calls here, as this runs inside
# $() and any stderr output leaks into the captured variable in some environments.
ensure_integration() {
    local name="$1"
    local body="$2"
    local existing
    existing=$(api_get "/integrations" | jq --arg n "$name" '.resources[] | select(.name == $n)' | jq -s '.[0] // empty')
    if [[ -n "$existing" && "$existing" != "null" ]]; then
        echo "$existing"
    else
        api_post "/integrations" "$body"
    fi
}

# ─── Step 2: (1) Fetch credential types ──────────────────────────────────────

section "Step 2: Fetch HTTP Bearer Token credential type"
CT_LIST=$(api_get "/credential_types")

BEARER_CT=$(echo "$CT_LIST" | jq '.resources[] | select(.name == "HTTP Bearer Token")')
if [[ -z "$BEARER_CT" ]]; then
    fail "HTTP Bearer Token credential type not found. Available types:"
    echo "$CT_LIST" | jq '.resources[].name'
    exit 1
fi
BEARER_CT_ID=$(echo "$BEARER_CT" | jq -r '.id')
ok "Found HTTP Bearer Token credential type: ${BEARER_CT_ID}"

# ─── Step 3: (2) Fetch default project ──────────────────────────────────────

section "Step 3 (2): Fetch default project"
PROJ_LIST=$(api_get "/projects?is_default=true")
DEFAULT_PROJ=$(echo "$PROJ_LIST" | jq '.resources[0]')
if [[ -z "$DEFAULT_PROJ" || "$DEFAULT_PROJ" == "null" ]]; then
    fail "Default project not found. All projects:"
    api_get "/projects" | jq '.resources[].name'
    exit 1
fi
DEFAULT_PROJ_ID=$(echo "$DEFAULT_PROJ" | jq -r '.id')
DEFAULT_PROJ_NAME=$(echo "$DEFAULT_PROJ" | jq -r '.name')
ok "Default project: ${DEFAULT_PROJ_NAME} (${DEFAULT_PROJ_ID})"
hr
pretty "$DEFAULT_PROJ"

# ─── Step 4: (3) Create credential in default project ───────────────────────

section "Step 4 (3): Create HTTP Bearer Token credential"
CRED=$(ensure_credential "Smoke Test Bearer Token" "$(cat <<EOF
{
    "name": "Smoke Test Bearer Token",
    "description": "Bearer token credential created by smoke-test-mcp-integration.sh",
    "credential_type_id": "${BEARER_CT_ID}",
    "project_id": "${DEFAULT_PROJ_ID}",
    "inputs": {"token": "smoke-test-token-abc123"}
}
EOF
)")
CRED_ID=$(echo "$CRED" | jq -r '.id')
CRED_NAME=$(echo "$CRED" | jq -r '.name')
ok "Credential: ${CRED_NAME} (${CRED_ID})"
hr
pretty "$CRED"

# ─── Step 5: (4) Create MCP server integration ──────────────────────────────

section "Step 5 (4): Create MCP server integration"
MCP_BASE_URL="http://mcp-server:${MCP_PORT}/mcp"
INTEGRATION=$(ensure_integration "Local Example MCP Server" "$(cat <<EOF
{
    "name": "Local Example MCP Server",
    "description": "Smoke test MCP integration (created by smoke-test-mcp-integration.sh)",
    "integration_type": "mcp_server",
    "management_credential_id": "${CRED_ID}",
    "configuration": {
        "integration_type": "mcp_server",
        "base_url": "${MCP_BASE_URL}"
    }
}
EOF
)")
INTEGRATION_ID=$(echo "$INTEGRATION" | jq -r '.id')
INTEGRATION_NAME=$(echo "$INTEGRATION" | jq -r '.name')
ok "Integration: ${INTEGRATION_NAME} (${INTEGRATION_ID})"
hr
pretty "$INTEGRATION"

# ─── Step 6: (5) List tools before validation ───────────────────────────────

section "Step 6 (5a): List tools filtered by integration (before refresh)"
TOOLS_BEFORE=$(api_get "/tool_manager/tools?integration_id=${INTEGRATION_ID}")
TOOL_COUNT_BEFORE=$(echo "$TOOLS_BEFORE" | jq '.resources | length')
ok "Tools before refresh: ${TOOL_COUNT_BEFORE}"
hr
pretty "$TOOLS_BEFORE"

# ─── Step 7: Validate the integration (connectivity check) ──────────────────

section "Step 7: Validate integration (connectivity check)"
log "Calling POST /integrations/${INTEGRATION_ID}/validate ..."
VALIDATE_RESULT=$(api_post "/integrations/${INTEGRATION_ID}/validate" "{}")
VALIDATE_SUCCESS=$(echo "$VALIDATE_RESULT" | jq -r '.success')
ok "Validation complete — success: ${VALIDATE_SUCCESS}"
hr
pretty "$VALIDATE_RESULT"

if [[ "$VALIDATE_SUCCESS" != "true" ]]; then
    fail "Integration validation failed — aborting"
    exit 1
fi

# ─── Step 8: Refresh integration (tool discovery) ────────────────────────────

section "Step 8: Refresh integration (trigger tool discovery)"
log "Calling POST /integrations/${INTEGRATION_ID}/refresh ..."
REFRESH_RESULT=$(api_post "/integrations/${INTEGRATION_ID}/refresh" "{}")
TOOLS_SYNCED=$(echo "$REFRESH_RESULT" | jq -r '.tools_synced_count // "n/a"')
TOOLS_UPDATED=$(echo "$REFRESH_RESULT" | jq -r '.tools_updated_count // "n/a"')
TOOLS_DISABLED=$(echo "$REFRESH_RESULT" | jq -r '.tools_disabled_count // "n/a"')
ok "Refresh complete — synced: ${TOOLS_SYNCED}, updated: ${TOOLS_UPDATED}, disabled: ${TOOLS_DISABLED}"
hr
pretty "$REFRESH_RESULT"

# ─── Step 9: List tools after refresh ───────────────────────────────────────

section "Step 9 (5b): List tools filtered by integration (after refresh)"
TOOLS_AFTER=$(api_get "/tool_manager/tools?integration_id=${INTEGRATION_ID}")
TOOL_COUNT_AFTER=$(echo "$TOOLS_AFTER" | jq '.resources | length')
ok "Tools after refresh: ${TOOL_COUNT_AFTER}"
hr
pretty "$TOOLS_AFTER"

if [[ "$TOOL_COUNT_BEFORE" -eq 0 && "$TOOL_COUNT_AFTER" -gt 0 ]]; then
    ok "Tools were discovered by refresh — ${TOOL_COUNT_AFTER} tool(s) synced"
elif [[ "$TOOL_COUNT_BEFORE" -gt 0 && "$TOOL_COUNT_AFTER" -eq "$TOOL_COUNT_BEFORE" ]]; then
    warn "Tool count unchanged (${TOOL_COUNT_AFTER}) — tools may have been pre-populated"
else
    warn "Tool count: ${TOOL_COUNT_BEFORE} → ${TOOL_COUNT_AFTER}"
fi

# ─── Step 10: Re-refresh (expect no changes) ─────────────────────────────────

section "Step 10: Re-refresh integration (expect no new tools)"
log "Calling POST /integrations/${INTEGRATION_ID}/refresh again..."
REREFRESH_RESULT=$(api_post "/integrations/${INTEGRATION_ID}/refresh" "{}")
REREFRESH_SYNCED=$(echo "$REREFRESH_RESULT" | jq -r '.tools_synced_count // "n/a"')
REREFRESH_DISABLED=$(echo "$REREFRESH_RESULT" | jq -r '.tools_disabled_count // "n/a"')
ok "Re-refresh complete — synced: ${REREFRESH_SYNCED}, disabled: ${REREFRESH_DISABLED}"
hr
pretty "$REREFRESH_RESULT"

TOOLS_FINAL=$(api_get "/tool_manager/tools?integration_id=${INTEGRATION_ID}")
TOOL_COUNT_FINAL=$(echo "$TOOLS_FINAL" | jq '.resources | length')
ok "Final tool count: ${TOOL_COUNT_FINAL}"

if [[ "$TOOL_COUNT_FINAL" -eq "$TOOL_COUNT_AFTER" ]]; then
    ok "Tool count unchanged after re-refresh (${TOOL_COUNT_FINAL}) — as expected"
else
    warn "Tool count changed: ${TOOL_COUNT_AFTER} → ${TOOL_COUNT_FINAL} (unexpected)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

section "Summary"
echo ""
echo -e "  ${BOLD}Credential Type (HTTP Bearer Token)${RESET}"
echo    "    ID:   ${BEARER_CT_ID}"
echo ""
echo -e "  ${BOLD}Default Project: ${DEFAULT_PROJ_NAME}${RESET}"
echo    "    ID:   ${DEFAULT_PROJ_ID}"
echo ""
echo -e "  ${BOLD}Credential (Bearer Token): ${CRED_NAME}${RESET}"
echo    "    ID:   ${CRED_ID}"
echo ""
echo -e "  ${BOLD}Integration: ${INTEGRATION_NAME}${RESET}"
echo    "    ID:         ${INTEGRATION_ID}"
echo    "    MCP URL:    ${MCP_BASE_URL}"
echo ""
echo -e "  ${BOLD}Tool Discovery${RESET}"
echo    "    Before refresh:      ${TOOL_COUNT_BEFORE}"
echo    "    After refresh:       ${TOOL_COUNT_AFTER} (synced=${TOOLS_SYNCED}, updated=${TOOLS_UPDATED}, disabled=${TOOLS_DISABLED})"
echo    "    After re-refresh:    ${TOOL_COUNT_FINAL} (synced=${REREFRESH_SYNCED}, disabled=${REREFRESH_DISABLED})"
echo ""
ok "Smoke test complete!"
echo ""
