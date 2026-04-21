#!/usr/bin/env bash
# authz-test-credential-rbac.sh - Test all RBAC combinations for credentials
#
# Prerequisites:
#   - Backend running on localhost:8000 (on feature/AAP-71955-credential-rbac branch)
#   - Demo data seeded: ./tools/authz-seed-demo-data.sh
#
# Usage: ./tools/authz-test-credential-rbac.sh
#
# Roles tested:
#   - admin (global)       = admin user
#   - auditor (global)     = demo-auditor (or quinn from seed)
#   - user (global)        = demo-user
#   - project-admin        = maya (project-admin of data-pipeline ONLY, not global admin)
#   - project-user         = frank (project-user of storefront + mobile-app)
#   - project-auditor      = james (project-auditor of storefront)
#   - unauthenticated      = no token
#
# Note: bob is NOT used as project-admin because he's also in the admins group (global admin).
#       maya is a pure project-admin (data-pipeline only) with no global role.

set -euo pipefail

BASE_URL="${APP_API_URL:-http://localhost:8000}"
API="$BASE_URL/api/v1"
ADMIN_PASSWORD_PATH="${APP_ADMIN_PASSWORD_PATH:-.secrets/admin-password}"
ADMIN_PASSWORD=$(cat "$ADMIN_PASSWORD_PATH" 2>/dev/null || echo "admin")

PASS=0
FAIL=0
SKIP=0
ERRORS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

get_token() {
    curl -sf "$API/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\": \"$1\", \"password\": \"$ADMIN_PASSWORD\"}" | python3 -c "
import sys, json
print(json.load(sys.stdin)['access_token'])
" 2>/dev/null
}

# Reliable HTTP status checker
http_status() {
    local method="$1" url="$2" token="${3:-}" body="${4:-}"

    if [ "$method" = "GET" ] || [ "$method" = "DELETE" ]; then
        if [ -n "$token" ]; then
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json"
        else
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json"
        fi
    else
        # POST or PATCH with body
        if [ -n "$token" ]; then
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                -d "$body"
        else
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -d "$body"
        fi
    fi
}

assert_status() {
    local case_num="$1" desc="$2" expected="$3" actual="$4"
    if [ "$actual" = "$expected" ]; then
        printf "${GREEN}  PASS${NC} #%-3s %-60s %s\n" "$case_num" "$desc" "$actual"
        PASS=$((PASS + 1))
    else
        printf "${RED}  FAIL${NC} #%-3s %-60s expected=%s got=%s\n" "$case_num" "$desc" "$expected" "$actual"
        FAIL=$((FAIL + 1))
        ERRORS+=("#$case_num: $desc (expected=$expected got=$actual)")
    fi
}

create_cred_as_admin() {
    local name="$1" project_id="$2"
    local body="{\"name\": \"$name\", \"credential_type_id\": \"$BEARER_TYPE\", \"inputs\": {\"token\": \"test-val\"}, \"project_id\": \"$project_id\"}"
    curl -sf "$API/credentials" -X POST \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true
}

cred_body() {
    local name="$1" project_id="$2"
    echo "{\"name\": \"$name\", \"credential_type_id\": \"$BEARER_TYPE\", \"inputs\": {\"token\": \"test-val\"}, \"project_id\": \"$project_id\"}"
}

cred_body_no_project() {
    local name="$1"
    echo "{\"name\": \"$name\", \"credential_type_id\": \"$BEARER_TYPE\", \"inputs\": {\"token\": \"test-val\"}}"
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Credential RBAC Test Suite${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

if ! curl -sf "$BASE_URL" > /dev/null 2>&1; then
    echo "ERROR: Backend not reachable at $BASE_URL"
    exit 1
fi

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
echo -e "${BLUE}Setting up...${NC}"

ADMIN_TOKEN=$(get_token "admin")
[ -z "$ADMIN_TOKEN" ] && echo "ERROR: Admin login failed" && exit 1

BEARER_TYPE=$(curl -sf "$API/credential_types" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
for t in json.load(sys.stdin).get('resources', []):
    if t['name'] == 'HTTP Bearer Token': print(t['id']); break
" 2>/dev/null)

# Projects — use data-pipeline (Project A for project-admin maya) and storefront (Project A for project-user frank)
# We need two different "Project A" concepts:
#   maya = project-admin of data-pipeline
#   frank = project-user of storefront
#   Both need a "Project B" they DON'T have access to

PROJ_DATAPIPE=$(curl -sf "$API/projects" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
projects = data.get('resources', data) if isinstance(data, dict) else data
for p in projects:
    if p['name'] == 'data-pipeline': print(p['id']); break
" 2>/dev/null || true)

PROJ_STOREFRONT=$(curl -sf "$API/projects" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
projects = data.get('resources', data) if isinstance(data, dict) else data
for p in projects:
    if p['name'] == 'storefront': print(p['id']); break
" 2>/dev/null || true)

PROJ_PAYMENT=$(curl -sf "$API/projects" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
projects = data.get('resources', data) if isinstance(data, dict) else data
for p in projects:
    if p['name'] == 'payment-service': print(p['id']); break
" 2>/dev/null || true)

echo "  Bearer type:  $BEARER_TYPE"
echo "  data-pipeline: $PROJ_DATAPIPE"
echo "  storefront:    $PROJ_STOREFRONT"
echo "  payment-svc:   $PROJ_PAYMENT"

# Create test credentials (all project-scoped — Option B, no global creds)
TS=$(date +%s)
DATAPIPE_CRED=$(create_cred_as_admin "rbac-datapipe-$TS" "$PROJ_DATAPIPE")
STOREFRONT_CRED=$(create_cred_as_admin "rbac-storefront-$TS" "$PROJ_STOREFRONT")
PAYMENT_CRED=$(create_cred_as_admin "rbac-payment-$TS" "$PROJ_PAYMENT")

echo "  Datapipe cred:   $DATAPIPE_CRED"
echo "  Storefront cred: $STOREFRONT_CRED"
echo "  Payment cred:    $PAYMENT_CRED"

# Get tokens
# Use quinn (security, project-auditor of payment-service) for auditor tests.
# demo-auditor has contaminated roles from manual setup.
# Quinn is a pure project-auditor — no global role.
AUDITOR_TOKEN=$(get_token "quinn" 2>/dev/null || get_token "demo-auditor" 2>/dev/null || true)
# demo-user has a custom password, try both
USER_TOKEN=$(get_token "demo-user" 2>/dev/null || true)
if [ -z "$USER_TOKEN" ]; then
    # Try with the custom password
    USER_TOKEN=$(curl -sf "$API/auth/login" -H "Content-Type: application/json" \
        -d '{"username":"demo-user","password":"DemoUser123!"}' | python3 -c "
import sys, json
print(json.load(sys.stdin)['access_token'])
" 2>/dev/null || true)
fi
MAYA_TOKEN=$(get_token "maya" 2>/dev/null || true)    # project-admin of data-pipeline ONLY
FRANK_TOKEN=$(get_token "frank" 2>/dev/null || true)  # project-user of storefront
JAMES_TOKEN=$(get_token "james" 2>/dev/null || true)  # project-auditor of storefront

echo ""

# ---------------------------------------------------------------------------
# Section 1: Unauthenticated
# ---------------------------------------------------------------------------
echo -e "${BLUE}--- Section 1: Unauthenticated (6 cases) ---${NC}"

assert_status 1  "Unauth: List"    "401" "$(http_status GET "$API/credentials")"
assert_status 2  "Unauth: Get"     "401" "$(http_status GET "$API/credentials/$DATAPIPE_CRED")"
assert_status 3  "Unauth: Create"  "401" "$(http_status POST "$API/credentials" "" "$(cred_body "unauth-$TS" "$PROJ_DATAPIPE")")"
assert_status 4  "Unauth: Update"  "401" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "" '{"name":"hacked"}')"
assert_status 5  "Unauth: Delete"  "401" "$(http_status DELETE "$API/credentials/$DATAPIPE_CRED")"
assert_status 6  "Unauth: Workflows" "401" "$(http_status GET "$API/credentials/$DATAPIPE_CRED/workflows")"

# ---------------------------------------------------------------------------
# Section 2: Admin (global)
# ---------------------------------------------------------------------------
echo -e "\n${BLUE}--- Section 2: Admin — global (15 cases) ---${NC}"

assert_status 7  "Admin: List"                   "200" "$(http_status GET "$API/credentials" "$ADMIN_TOKEN")"
assert_status 8  "Admin: Get project cred"        "200" "$(http_status GET "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN")"
assert_status 9  "Admin: Create with project_id"  "201" "$(http_status POST "$API/credentials" "$ADMIN_TOKEN" "$(cred_body "admin-c1-$TS" "$PROJ_DATAPIPE")")"
assert_status 10 "Admin: Create without project"  "422" "$(http_status POST "$API/credentials" "$ADMIN_TOKEN" "$(cred_body_no_project "admin-noproj-$TS")")"
assert_status 11 "Admin: Update project cred"     "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"description":"admin-updated"}')"
assert_status 12 "Admin: Enable"                  "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":true}')"
assert_status 13 "Admin: Disable"                 "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":false}')"
http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":true}' > /dev/null  # restore

DEL1=$(create_cred_as_admin "admin-del-$TS" "$PROJ_DATAPIPE")
assert_status 14 "Admin: Delete"                  "204" "$(http_status DELETE "$API/credentials/$DEL1" "$ADMIN_TOKEN")"
assert_status 15 "Admin: Get workflows"           "200" "$(http_status GET "$API/credentials/$DATAPIPE_CRED/workflows" "$ADMIN_TOKEN")"

# ---------------------------------------------------------------------------
# Section 3: Auditor (global)
# ---------------------------------------------------------------------------
# quinn = project-auditor of payment-service (read-only within that project)
if [ -n "$AUDITOR_TOKEN" ]; then
echo -e "\n${BLUE}--- Section 3: Project-Auditor — quinn/payment-service (12 cases) ---${NC}"

assert_status 16 "Auditor: List"                  "200" "$(http_status GET "$API/credentials" "$AUDITOR_TOKEN")"
assert_status 17 "Auditor: Get payment cred"      "200" "$(http_status GET "$API/credentials/$PAYMENT_CRED" "$AUDITOR_TOKEN")"
assert_status 18 "Auditor: Get other project"     "403" "$(http_status GET "$API/credentials/$DATAPIPE_CRED" "$AUDITOR_TOKEN")"
assert_status 19 "Auditor: Create"                "403" "$(http_status POST "$API/credentials" "$AUDITOR_TOKEN" "$(cred_body "aud-c-$TS" "$PROJ_PAYMENT")")"
assert_status 20 "Auditor: Update"                "403" "$(http_status PATCH "$API/credentials/$PAYMENT_CRED" "$AUDITOR_TOKEN" '{"name":"hacked"}')"
assert_status 21 "Auditor: Enable"                "403" "$(http_status PATCH "$API/credentials/$PAYMENT_CRED" "$AUDITOR_TOKEN" '{"enabled":true}')"
assert_status 22 "Auditor: Disable"               "403" "$(http_status PATCH "$API/credentials/$PAYMENT_CRED" "$AUDITOR_TOKEN" '{"enabled":false}')"
assert_status 23 "Auditor: Delete"                "403" "$(http_status DELETE "$API/credentials/$PAYMENT_CRED" "$AUDITOR_TOKEN")"
assert_status 24 "Auditor: Workflows own project" "200" "$(http_status GET "$API/credentials/$PAYMENT_CRED/workflows" "$AUDITOR_TOKEN")"
assert_status 25 "Auditor: Workflows other proj"  "403" "$(http_status GET "$API/credentials/$DATAPIPE_CRED/workflows" "$AUDITOR_TOKEN")"
else
echo -e "\n${YELLOW}--- Section 3: Auditor — SKIPPED ---${NC}"; SKIP=$((SKIP + 11))
fi

# ---------------------------------------------------------------------------
# Section 4: User (global)
# ---------------------------------------------------------------------------
if [ -n "$USER_TOKEN" ]; then
echo -e "\n${BLUE}--- Section 4: User — global (12 cases) ---${NC}"

assert_status 26 "User: List"                     "200" "$(http_status GET "$API/credentials" "$USER_TOKEN")"
assert_status 27 "User: Get project cred"         "200" "$(http_status GET "$API/credentials/$DATAPIPE_CRED" "$USER_TOKEN")"
assert_status 28 "User: Create with project"      "201" "$(http_status POST "$API/credentials" "$USER_TOKEN" "$(cred_body "user-c-$TS" "$PROJ_DATAPIPE")")"
assert_status 29 "User: Create without project"   "422" "$(http_status POST "$API/credentials" "$USER_TOKEN" "$(cred_body_no_project "user-noproj-$TS")")"
assert_status 30 "User: Update"                   "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$USER_TOKEN" '{"description":"user-updated"}')"
assert_status 31 "User: Enable"                   "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$USER_TOKEN" '{"enabled":true}')"
assert_status 32 "User: Disable"                  "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$USER_TOKEN" '{"enabled":false}')"
http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":true}' > /dev/null  # restore
assert_status 33 "User: Delete"                   "403" "$(http_status DELETE "$API/credentials/$DATAPIPE_CRED" "$USER_TOKEN")"
assert_status 34 "User: Get workflows"            "200" "$(http_status GET "$API/credentials/$DATAPIPE_CRED/workflows" "$USER_TOKEN")"
else
echo -e "\n${YELLOW}--- Section 4: User — SKIPPED ---${NC}"; SKIP=$((SKIP + 9))
fi

# ---------------------------------------------------------------------------
# Section 5: Project-Admin (maya = project-admin of data-pipeline ONLY)
# ---------------------------------------------------------------------------
if [ -n "$MAYA_TOKEN" ]; then
echo -e "\n${BLUE}--- Section 5: Project-Admin — maya/data-pipeline (18 cases) ---${NC}"

assert_status 35 "ProjAdmin: List"                        "200" "$(http_status GET "$API/credentials" "$MAYA_TOKEN")"
assert_status 36 "ProjAdmin: Get own project cred"        "200" "$(http_status GET "$API/credentials/$DATAPIPE_CRED" "$MAYA_TOKEN")"
assert_status 37 "ProjAdmin: Get other project cred"      "403" "$(http_status GET "$API/credentials/$PAYMENT_CRED" "$MAYA_TOKEN")"
assert_status 38 "ProjAdmin: Create in own project"       "201" "$(http_status POST "$API/credentials" "$MAYA_TOKEN" "$(cred_body "maya-c1-$TS" "$PROJ_DATAPIPE")")"
assert_status 39 "ProjAdmin: Create in other project"     "403" "$(http_status POST "$API/credentials" "$MAYA_TOKEN" "$(cred_body "maya-c2-$TS" "$PROJ_PAYMENT")")"
assert_status 40 "ProjAdmin: Create without project"      "422" "$(http_status POST "$API/credentials" "$MAYA_TOKEN" "$(cred_body_no_project "maya-noproj-$TS")")"
assert_status 41 "ProjAdmin: Update own project cred"     "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$MAYA_TOKEN" '{"description":"maya-updated"}')"
assert_status 42 "ProjAdmin: Update other project cred"   "403" "$(http_status PATCH "$API/credentials/$PAYMENT_CRED" "$MAYA_TOKEN" '{"name":"hacked"}')"
assert_status 43 "ProjAdmin: Enable own project cred"     "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$MAYA_TOKEN" '{"enabled":true}')"
assert_status 44 "ProjAdmin: Disable own project cred"    "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$MAYA_TOKEN" '{"enabled":false}')"
http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":true}' > /dev/null  # restore
assert_status 45 "ProjAdmin: Enable other project cred"   "403" "$(http_status PATCH "$API/credentials/$PAYMENT_CRED" "$MAYA_TOKEN" '{"enabled":true}')"

DEL2=$(create_cred_as_admin "maya-del-$TS" "$PROJ_DATAPIPE")
assert_status 46 "ProjAdmin: Delete own project cred"     "204" "$(http_status DELETE "$API/credentials/$DEL2" "$MAYA_TOKEN")"
assert_status 47 "ProjAdmin: Delete other project cred"   "403" "$(http_status DELETE "$API/credentials/$PAYMENT_CRED" "$MAYA_TOKEN")"
assert_status 48 "ProjAdmin: Workflows own project"       "200" "$(http_status GET "$API/credentials/$DATAPIPE_CRED/workflows" "$MAYA_TOKEN")"
assert_status 49 "ProjAdmin: Workflows other project"     "403" "$(http_status GET "$API/credentials/$PAYMENT_CRED/workflows" "$MAYA_TOKEN")"
else
echo -e "\n${YELLOW}--- Section 5: Project-Admin — SKIPPED (run seed script) ---${NC}"; SKIP=$((SKIP + 16))
fi

# ---------------------------------------------------------------------------
# Section 6: Project-User (frank = project-user of storefront)
# ---------------------------------------------------------------------------
if [ -n "$FRANK_TOKEN" ]; then
echo -e "\n${BLUE}--- Section 6: Project-User — frank/storefront (18 cases) ---${NC}"

assert_status 50 "ProjUser: List"                         "200" "$(http_status GET "$API/credentials" "$FRANK_TOKEN")"
assert_status 51 "ProjUser: Get own project cred"         "200" "$(http_status GET "$API/credentials/$STOREFRONT_CRED" "$FRANK_TOKEN")"
assert_status 52 "ProjUser: Get other project cred"       "403" "$(http_status GET "$API/credentials/$PAYMENT_CRED" "$FRANK_TOKEN")"
assert_status 53 "ProjUser: Create in own project"        "201" "$(http_status POST "$API/credentials" "$FRANK_TOKEN" "$(cred_body "frank-c1-$TS" "$PROJ_STOREFRONT")")"
assert_status 54 "ProjUser: Create in other project"      "403" "$(http_status POST "$API/credentials" "$FRANK_TOKEN" "$(cred_body "frank-c2-$TS" "$PROJ_PAYMENT")")"
assert_status 55 "ProjUser: Create without project"       "422" "$(http_status POST "$API/credentials" "$FRANK_TOKEN" "$(cred_body_no_project "frank-noproj-$TS")")"
assert_status 56 "ProjUser: Update own project cred"      "200" "$(http_status PATCH "$API/credentials/$STOREFRONT_CRED" "$FRANK_TOKEN" '{"description":"frank-updated"}')"
assert_status 57 "ProjUser: Update other project cred"    "403" "$(http_status PATCH "$API/credentials/$PAYMENT_CRED" "$FRANK_TOKEN" '{"name":"hacked"}')"
assert_status 58 "ProjUser: Enable own project cred"      "200" "$(http_status PATCH "$API/credentials/$STOREFRONT_CRED" "$FRANK_TOKEN" '{"enabled":true}')"
assert_status 59 "ProjUser: Disable own project cred"     "200" "$(http_status PATCH "$API/credentials/$STOREFRONT_CRED" "$FRANK_TOKEN" '{"enabled":false}')"
http_status PATCH "$API/credentials/$STOREFRONT_CRED" "$ADMIN_TOKEN" '{"enabled":true}' > /dev/null  # restore
assert_status 60 "ProjUser: Delete own project"           "403" "$(http_status DELETE "$API/credentials/$STOREFRONT_CRED" "$FRANK_TOKEN")"
assert_status 61 "ProjUser: Delete other project"         "403" "$(http_status DELETE "$API/credentials/$PAYMENT_CRED" "$FRANK_TOKEN")"
assert_status 62 "ProjUser: Workflows own project"        "200" "$(http_status GET "$API/credentials/$STOREFRONT_CRED/workflows" "$FRANK_TOKEN")"
assert_status 63 "ProjUser: Workflows other project"      "403" "$(http_status GET "$API/credentials/$PAYMENT_CRED/workflows" "$FRANK_TOKEN")"
else
echo -e "\n${YELLOW}--- Section 6: Project-User — SKIPPED (run seed script) ---${NC}"; SKIP=$((SKIP + 17))
fi

# ---------------------------------------------------------------------------
# Section 7: Project-Auditor (james = project-auditor of storefront)
# ---------------------------------------------------------------------------
if [ -n "$JAMES_TOKEN" ]; then
echo -e "\n${BLUE}--- Section 7: Project-Auditor — james/storefront (14 cases) ---${NC}"

assert_status 64 "ProjAuditor: List"                      "200" "$(http_status GET "$API/credentials" "$JAMES_TOKEN")"
assert_status 65 "ProjAuditor: Get own project cred"      "200" "$(http_status GET "$API/credentials/$STOREFRONT_CRED" "$JAMES_TOKEN")"
assert_status 66 "ProjAuditor: Get other project cred"    "403" "$(http_status GET "$API/credentials/$PAYMENT_CRED" "$JAMES_TOKEN")"
assert_status 67 "ProjAuditor: Create"                    "403" "$(http_status POST "$API/credentials" "$JAMES_TOKEN" "$(cred_body "james-c-$TS" "$PROJ_STOREFRONT")")"
assert_status 68 "ProjAuditor: Update"                    "403" "$(http_status PATCH "$API/credentials/$STOREFRONT_CRED" "$JAMES_TOKEN" '{"name":"hacked"}')"
assert_status 69 "ProjAuditor: Enable"                    "403" "$(http_status PATCH "$API/credentials/$STOREFRONT_CRED" "$JAMES_TOKEN" '{"enabled":true}')"
assert_status 70 "ProjAuditor: Disable"                   "403" "$(http_status PATCH "$API/credentials/$STOREFRONT_CRED" "$JAMES_TOKEN" '{"enabled":false}')"
assert_status 71 "ProjAuditor: Delete"                    "403" "$(http_status DELETE "$API/credentials/$STOREFRONT_CRED" "$JAMES_TOKEN")"
assert_status 72 "ProjAuditor: Workflows own project"     "200" "$(http_status GET "$API/credentials/$STOREFRONT_CRED/workflows" "$JAMES_TOKEN")"
assert_status 73 "ProjAuditor: Workflows other project"   "403" "$(http_status GET "$API/credentials/$PAYMENT_CRED/workflows" "$JAMES_TOKEN")"
else
echo -e "\n${YELLOW}--- Section 7: Project-Auditor — SKIPPED (run seed script) ---${NC}"; SKIP=$((SKIP + 12))
fi

# ---------------------------------------------------------------------------
# Section 8: Edge Cases
# ---------------------------------------------------------------------------
echo -e "\n${BLUE}--- Section 8: Edge Cases (10 cases) ---${NC}"

FAKE_ID="00000000-0000-0000-0000-000000000099"
assert_status 74 "Edge: Get non-existent"                 "404" "$(http_status GET "$API/credentials/$FAKE_ID" "$ADMIN_TOKEN")"
assert_status 75 "Edge: Update non-existent"              "404" "$(http_status PATCH "$API/credentials/$FAKE_ID" "$ADMIN_TOKEN" '{"name":"x"}')"
assert_status 76 "Edge: Delete non-existent"              "404" "$(http_status DELETE "$API/credentials/$FAKE_ID" "$ADMIN_TOKEN")"

# Duplicate name
EXISTING_NAME=$(curl -sf "$API/credentials" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin)['resources'][0]['name'])" 2>/dev/null)
assert_status 77 "Edge: Create duplicate name"            "409" "$(http_status POST "$API/credentials" "$ADMIN_TOKEN" "$(cred_body "$EXISTING_NAME" "$PROJ_DATAPIPE")")"

assert_status 78 "Edge: Create invalid type_id"           "422" "$(http_status POST "$API/credentials" "$ADMIN_TOKEN" "{\"name\":\"edge-type-$TS\",\"credential_type_id\":\"$FAKE_ID\",\"inputs\":{\"token\":\"x\"},\"project_id\":\"$PROJ_DATAPIPE\"}")"
assert_status 79 "Edge: Create without project_id"        "422" "$(http_status POST "$API/credentials" "$ADMIN_TOKEN" "$(cred_body_no_project "edge-noproj-$TS")")"
assert_status 80 "Edge: Update with \$encrypted\$"        "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"inputs":{"token":"$encrypted$"}}')"
assert_status 81 "Edge: Enable already-enabled"            "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":true}')"
assert_status 82 "Edge: Disable already-disabled"          "200" "$(http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":false}')"
http_status PATCH "$API/credentials/$DATAPIPE_CRED" "$ADMIN_TOKEN" '{"enabled":true}' > /dev/null  # restore

# ---------------------------------------------------------------------------
# Section 9: Credential Type Endpoints (no RBAC)
# ---------------------------------------------------------------------------
echo -e "\n${BLUE}--- Section 9: Credential Types — no RBAC (3 cases) ---${NC}"

assert_status 83 "CredType: List (auth)"                  "200" "$(http_status GET "$API/credential_types" "$ADMIN_TOKEN")"
assert_status 84 "CredType: Get (auth)"                   "200" "$(http_status GET "$API/credential_types/$BEARER_TYPE" "$ADMIN_TOKEN")"
assert_status 85 "CredType: List (unauth)"                "401" "$(http_status GET "$API/credential_types")"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  RESULTS${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "  ${GREEN}PASS: $PASS${NC}"
echo -e "  ${RED}FAIL: $FAIL${NC}"
echo -e "  ${YELLOW}SKIP: $SKIP${NC}"
echo "  TOTAL: $((PASS + FAIL + SKIP))"
echo ""

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo -e "${RED}Failed tests:${NC}"
    for err in "${ERRORS[@]}"; do
        echo "  $err"
    done
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}$FAIL test(s) failed.${NC}"
    exit 1
fi
