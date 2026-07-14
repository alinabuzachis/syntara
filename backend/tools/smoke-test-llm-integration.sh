#!/usr/bin/env bash
# smoke-test-llm-integration.sh
#
# End-to-end smoke test for the LLM provider integration flow.
# Assumes all services are already running (make build-images && make run-all).
#
# Prerequisites:
#   - jq, curl installed
#   - API running on port 8000
#   - LLM_API_KEY and LLM_BASE_URL set (or a reachable OpenAI-compatible endpoint)
#   - Run from the project root: ./tools/smoke-test-llm-integration.sh
#
# Environment variables:
#   APP_BASE_URL   Backend API base (default: http://localhost:8000)
#   ADMIN_PASSWORD Admin password (default: reads .secrets/admin-password)
#   LLM_API_KEY    API key for the LLM provider (required)
#   LLM_BASE_URL   Base URL of the LLM provider (default: https://api.openai.com)

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
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(cat .secrets/admin-password 2>/dev/null || echo '')}"
LLM_API_KEY="${LLM_API_KEY:-}"
LLM_BASE_URL="${LLM_BASE_URL:-https://api.openai.com}"

# ─── Step 1: Authenticate ────────────────────────────────────────────────────

section "Step 1: Authenticate as admin"
if [[ -z "$ADMIN_PASSWORD" ]]; then
    fail "ADMIN_PASSWORD not set and .secrets/admin-password not found"
    exit 1
fi
if [[ -z "$LLM_API_KEY" ]]; then
    fail "LLM_API_KEY not set. Export it before running this script."
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

# ─── Step 2: Fetch credential types ──────────────────────────────────────────

section "Step 2: Fetch LLM Provider credential type"
CT_LIST=$(api_get "/credential_types")

LLM_CT=$(echo "$CT_LIST" | jq '.resources[] | select(.name == "LLM Provider")')
if [[ -z "$LLM_CT" ]]; then
    fail "LLM Provider credential type not found. Available types:"
    echo "$CT_LIST" | jq '.resources[].name'
    exit 1
fi
LLM_CT_ID=$(echo "$LLM_CT" | jq -r '.id')
ok "Found LLM Provider credential type: ${LLM_CT_ID}"

# ─── Step 3: Fetch default project ──────────────────────────────────────────

section "Step 3: Fetch default project"
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

# ─── Step 4: Create management credential ────────────────────────────────────

section "Step 4: Create LLM Provider management credential"
MGMT_CRED=$(ensure_credential "OpenRouter API Key" "$(cat <<EOF
{
    "name": "OpenRouter API Key",
    "description": "Management credential for OpenRouter LLM",
    "credential_type_id": "${LLM_CT_ID}",
    "project_id": "${DEFAULT_PROJ_ID}",
    "inputs": {
        "api_key": "${LLM_API_KEY}",
        "base_url": "${LLM_BASE_URL}"
    }
}
EOF
)")
MGMT_CRED_ID=$(echo "$MGMT_CRED" | jq -r '.id')
MGMT_CRED_NAME=$(echo "$MGMT_CRED" | jq -r '.name')
ok "Management credential: ${MGMT_CRED_NAME} (${MGMT_CRED_ID})"

# ─── Step 5: Create LLM provider integration ─────────────────────────────────

section "Step 5: Create LLM provider integration"
INTEGRATION=$(ensure_integration "OpenRouter" "$(cat <<EOF
{
    "name": "OpenRouter",
    "description": "OpenRouter LLM provider integration created by script",
    "integration_type": "llm_provider",
    "management_credential_id": "${MGMT_CRED_ID}",
    "configuration": {
        "integration_type": "llm_provider",
        "provider_hint": "custom",
        "base_url": "${LLM_BASE_URL}"
    }
}
EOF
)")
INTEGRATION_ID=$(echo "$INTEGRATION" | jq -r '.id')
INTEGRATION_NAME=$(echo "$INTEGRATION" | jq -r '.name')
ok "Integration: ${INTEGRATION_NAME} (${INTEGRATION_ID})"
hr
pretty "$INTEGRATION"

# ─── Step 6: List models before refresh ──────────────────────────────────────

section "Step 6: List models before refresh"
MODELS_BEFORE=$(api_get "/integrations/${INTEGRATION_ID}/models")
MODEL_COUNT_BEFORE=$(echo "$MODELS_BEFORE" | jq '.resources | length')
ok "Models before refresh: ${MODEL_COUNT_BEFORE}"

# ─── Step 7: Validate integration ────────────────────────────────────────────

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

# ─── Step 8: Refresh integration (model discovery) ───────────────────────────

section "Step 8: Refresh integration (trigger model discovery)"
log "Calling POST /integrations/${INTEGRATION_ID}/refresh ..."
REFRESH_RESULT=$(api_post "/integrations/${INTEGRATION_ID}/refresh" "{}")
MODELS_SYNCED=$(echo "$REFRESH_RESULT" | jq -r '.models_synced_count // "n/a"')
MODELS_UPDATED=$(echo "$REFRESH_RESULT" | jq -r '.models_updated_count // "n/a"')
ok "Refresh complete — synced: ${MODELS_SYNCED}, updated: ${MODELS_UPDATED}"
hr
pretty "$REFRESH_RESULT"

# ─── Step 9: List models after refresh ───────────────────────────────────────

section "Step 9: List models after refresh"
MODELS_AFTER=$(api_get "/integrations/${INTEGRATION_ID}/models")
MODEL_COUNT_AFTER=$(echo "$MODELS_AFTER" | jq '.resources | length')
ok "Models after refresh: ${MODEL_COUNT_AFTER}"
hr
pretty "$MODELS_AFTER"

if [[ "$MODEL_COUNT_AFTER" -eq 0 ]]; then
    fail "No models discovered — check LLM_BASE_URL and LLM_API_KEY"
    exit 1
fi
ok "Models discovered: ${MODEL_COUNT_AFTER}"

# ─── Step 10: Re-refresh (idempotency) ───────────────────────────────────────

section "Step 10: Re-refresh integration (idempotency check)"
log "Calling POST /integrations/${INTEGRATION_ID}/refresh again..."
REREFRESH_RESULT=$(api_post "/integrations/${INTEGRATION_ID}/refresh" "{}")
REREFRESH_SYNCED=$(echo "$REREFRESH_RESULT" | jq -r '.models_synced_count // "n/a"')
ok "Re-refresh complete — synced: ${REREFRESH_SYNCED}"

MODELS_FINAL=$(api_get "/integrations/${INTEGRATION_ID}/models")
MODEL_COUNT_FINAL=$(echo "$MODELS_FINAL" | jq '.resources | length')

if [[ "$MODEL_COUNT_FINAL" -eq "$MODEL_COUNT_AFTER" ]]; then
    ok "Model count unchanged after re-refresh (${MODEL_COUNT_FINAL}) — as expected"
else
    warn "Model count changed: ${MODEL_COUNT_AFTER} → ${MODEL_COUNT_FINAL} (unexpected)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

section "Summary"
ok "Integration ID: ${INTEGRATION_ID}"
ok "Management credential ID: ${MGMT_CRED_ID}"
ok "Models discovered: ${MODEL_COUNT_FINAL}"
echo ""
echo "To use this integration in a workflow node, set:"
echo "  integration_id = ${INTEGRATION_ID}"
echo "  credential_id  = ${MGMT_CRED_ID}  (execution credential)"
echo ""
ok "Smoke test complete"
