#!/usr/bin/env bash
# authz-seed-demo-data.sh - Seed demo data to exercise all roles and features
#
# Prerequisites: Backend running on localhost:8000
# Usage: ./tools/authz-seed-demo-data.sh [--clean]
#
# Creates:
#   Users:     20 users across engineering, product, QA, SRE, data, security, executive personas
#   Groups:    10 groups (functional teams + cross-functional)
#   Projects:  5 projects (storefront, payment-service, data-pipeline, mobile-app, internal-tools)
#   Workflows: 4-10 per project (~35 total, mix of simple + approval-gated)
#   Executions: sample runs by different users
#   Approvals:  pending approval requests for UI testing

set -euo pipefail

CLI="uv run python tools/authz_cli.py"
BASE_URL="${APP_API_URL:-http://localhost:8000}"
API="$BASE_URL/api/v1"
ADMIN_PASSWORD_PATH="${APP_ADMIN_PASSWORD_PATH:-.secrets/admin-password}"
ADMIN_PASSWORD=$(cat "$ADMIN_PASSWORD_PATH" 2>/dev/null || echo "admin")

info()  { echo "==> $*"; }
step()  { echo "  -> $*"; }
warn()  { echo "  !! $*"; }

get_token() {
    curl -sf "$API/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\": \"$1\", \"password\": \"$ADMIN_PASSWORD\"}" | python3 -c "
import sys, json
print(json.load(sys.stdin)['access_token'])
" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
if ! curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    echo "ERROR: Backend not reachable at $BASE_URL"
    echo "Start it with: make run"
    exit 1
fi

if [[ "${1:-}" == "--clean" ]]; then
    info "Cleaning existing demo data..."
    $CLI clean -y
    info "Re-seeding built-in policies and roles..."
    $CLI seed-builtin
    shift
fi

# ---------------------------------------------------------------------------
# 1. Users (20 users with varied personas)
# ---------------------------------------------------------------------------
info "Creating users..."

# Engineering leads
$CLI create-user alice   --email alice@example.com   --full-name "Alice Chen"       --password "$ADMIN_PASSWORD"
$CLI create-user bob     --email bob@example.com     --full-name "Bob Martinez"     --password "$ADMIN_PASSWORD"

# Backend engineers
$CLI create-user carol   --email carol@example.com   --full-name "Carol Williams"   --password "$ADMIN_PASSWORD"
$CLI create-user dave    --email dave@example.com    --full-name "Dave Patel"       --password "$ADMIN_PASSWORD"
$CLI create-user elena   --email elena@example.com   --full-name "Elena Novak"      --password "$ADMIN_PASSWORD"

# Frontend engineers
$CLI create-user frank   --email frank@example.com   --full-name "Frank Okafor"     --password "$ADMIN_PASSWORD"
$CLI create-user grace   --email grace@example.com   --full-name "Grace Kim"        --password "$ADMIN_PASSWORD"

# SRE / DevOps
$CLI create-user hector  --email hector@example.com  --full-name "Hector Reyes"     --password "$ADMIN_PASSWORD"
$CLI create-user iris    --email iris@example.com    --full-name "Iris Tanaka"      --password "$ADMIN_PASSWORD"

# QA engineers
$CLI create-user james   --email james@example.com   --full-name "James O'Brien"    --password "$ADMIN_PASSWORD"
$CLI create-user karen   --email karen@example.com   --full-name "Karen Liu"        --password "$ADMIN_PASSWORD"
$CLI create-user leo     --email leo@example.com     --full-name "Leo Andersen"     --password "$ADMIN_PASSWORD"

# Data engineers
$CLI create-user maya    --email maya@example.com    --full-name "Maya Gupta"       --password "$ADMIN_PASSWORD"
$CLI create-user nate    --email nate@example.com    --full-name "Nate Fischer"     --password "$ADMIN_PASSWORD"

# Product managers
$CLI create-user olivia  --email olivia@example.com  --full-name "Olivia Santos"    --password "$ADMIN_PASSWORD"
$CLI create-user paul    --email paul@example.com    --full-name "Paul Johansson"   --password "$ADMIN_PASSWORD"

# Security
$CLI create-user quinn   --email quinn@example.com   --full-name "Quinn Harper"     --password "$ADMIN_PASSWORD"

# Executive / read-only stakeholders
$CLI create-user rachel  --email rachel@example.com  --full-name "Rachel Nakamura"  --password "$ADMIN_PASSWORD"
$CLI create-user sam     --email sam@example.com     --full-name "Sam Dubois"       --password "$ADMIN_PASSWORD"
$CLI create-user tina    --email tina@example.com    --full-name "Tina Kowalski"    --password "$ADMIN_PASSWORD"

# ---------------------------------------------------------------------------
# 2. Groups (10 groups)
# ---------------------------------------------------------------------------
info "Creating groups..."

$CLI create-group backend-eng     --description "Backend engineering team"
$CLI create-group frontend-eng    --description "Frontend engineering team"
$CLI create-group sre             --description "Site reliability engineering"
$CLI create-group qa              --description "Quality assurance"
$CLI create-group data-eng        --description "Data engineering and analytics"
$CLI create-group product         --description "Product management"
$CLI create-group security        --description "Security team"
$CLI create-group leadership      --description "Engineering leadership and executives"
$CLI create-group on-call         --description "Current on-call rotation"
$CLI create-group release-managers --description "Release management (cross-functional)"

# ---------------------------------------------------------------------------
# 3. Group memberships
# ---------------------------------------------------------------------------
info "Adding users to groups..."

# admins group
$CLI add-group-member admins alice
$CLI add-group-member admins bob

# backend-eng
$CLI add-group-member backend-eng alice
$CLI add-group-member backend-eng carol
$CLI add-group-member backend-eng dave
$CLI add-group-member backend-eng elena

# frontend-eng
$CLI add-group-member frontend-eng bob
$CLI add-group-member frontend-eng frank
$CLI add-group-member frontend-eng grace

# sre
$CLI add-group-member sre hector
$CLI add-group-member sre iris

# qa
$CLI add-group-member qa james
$CLI add-group-member qa karen
$CLI add-group-member qa leo

# data-eng
$CLI add-group-member data-eng maya
$CLI add-group-member data-eng nate

# product
$CLI add-group-member product olivia
$CLI add-group-member product paul

# security
$CLI add-group-member security quinn

# leadership
$CLI add-group-member leadership rachel
$CLI add-group-member leadership sam
$CLI add-group-member leadership tina

# on-call (rotating - currently hector and carol)
$CLI add-group-member on-call hector
$CLI add-group-member on-call carol

# release-managers (cross-functional)
$CLI add-group-member release-managers alice
$CLI add-group-member release-managers bob
$CLI add-group-member release-managers hector
$CLI add-group-member release-managers olivia

# ---------------------------------------------------------------------------
# 4. Projects
# ---------------------------------------------------------------------------
info "Creating projects..."

$CLI create-project storefront      --description "Customer-facing web storefront"
$CLI create-project payment-service --description "Payment processing backend"
$CLI create-project data-pipeline   --description "Data ingestion and analytics pipeline"
$CLI create-project mobile-app      --description "iOS and Android mobile application"
$CLI create-project internal-tools  --description "Internal developer tooling and dashboards"

# ---------------------------------------------------------------------------
# 5. Project-level role assignments
# ---------------------------------------------------------------------------
info "Assigning project-level roles..."

# -- storefront: frontend-heavy, bob leads --
$CLI assign-role project-admin   --user bob     --project storefront
$CLI assign-role project-user    --user frank   --project storefront
$CLI assign-role project-user    --user grace   --project storefront
$CLI assign-role project-user    --user carol   --project storefront  # backend support
$CLI assign-role project-auditor --user james   --project storefront  # QA
$CLI assign-role project-auditor --user olivia  --project storefront  # PM
$CLI assign-role project-auditor --user rachel  --project storefront  # exec visibility

# -- payment-service: backend-heavy, alice leads --
$CLI assign-role project-admin   --user alice   --project payment-service
$CLI assign-role project-user    --user carol   --project payment-service
$CLI assign-role project-user    --user dave    --project payment-service
$CLI assign-role project-user    --user elena   --project payment-service
$CLI assign-role project-auditor --user quinn   --project payment-service  # security review
$CLI assign-role project-auditor --user karen   --project payment-service  # QA
$CLI assign-role project-auditor --user paul    --project payment-service  # PM

# -- data-pipeline: data team owns, SRE supports --
$CLI assign-role project-admin   --user maya    --project data-pipeline
$CLI assign-role project-user    --user nate    --project data-pipeline
$CLI assign-role project-user    --user hector  --project data-pipeline  # SRE infra support
$CLI assign-role project-user    --user iris    --project data-pipeline  # SRE infra support
$CLI assign-role project-auditor --user leo     --project data-pipeline  # QA
$CLI assign-role project-auditor --user sam     --project data-pipeline  # exec visibility

# -- mobile-app: frontend + backend collaboration --
$CLI assign-role project-admin   --user bob     --project mobile-app
$CLI assign-role project-admin   --user alice   --project mobile-app
$CLI assign-role project-user    --user frank   --project mobile-app
$CLI assign-role project-user    --user grace   --project mobile-app
$CLI assign-role project-user    --user dave    --project mobile-app     # backend APIs
$CLI assign-role project-auditor --user james   --project mobile-app     # QA
$CLI assign-role project-auditor --user karen   --project mobile-app     # QA
$CLI assign-role project-auditor --user olivia  --project mobile-app     # PM
$CLI assign-role project-auditor --user tina    --project mobile-app     # exec visibility

# -- internal-tools: SRE owns, everyone can read --
$CLI assign-role project-admin   --user hector  --project internal-tools
$CLI assign-role project-user    --user iris    --project internal-tools
$CLI assign-role project-user    --user elena   --project internal-tools
$CLI assign-role project-user    --user nate    --project internal-tools
$CLI assign-role project-auditor --user quinn   --project internal-tools  # security

# ---------------------------------------------------------------------------
# 6. Get admin token for API calls
# ---------------------------------------------------------------------------
info "Obtaining admin token..."
ADMIN_TOKEN=$(get_token "admin")
if [ -z "$ADMIN_TOKEN" ]; then
    echo "ERROR: Failed to obtain admin token"
    exit 1
fi
step "admin token obtained"

# ---------------------------------------------------------------------------
# 7. Resolve project IDs
# ---------------------------------------------------------------------------
info "Resolving project IDs..."

resolve_project_id() {
    curl -sf "$API/projects" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
for p in json.load(sys.stdin):
    if p['name'] == '$1': print(p['id']); break
" 2>/dev/null || true
}

STOREFRONT_ID=$(resolve_project_id "storefront")
PAYMENT_ID=$(resolve_project_id "payment-service")
PIPELINE_ID=$(resolve_project_id "data-pipeline")
MOBILE_ID=$(resolve_project_id "mobile-app")
TOOLS_ID=$(resolve_project_id "internal-tools")

step "storefront=$STOREFRONT_ID"
step "payment-service=$PAYMENT_ID"
step "data-pipeline=$PIPELINE_ID"
step "mobile-app=$MOBILE_ID"
step "internal-tools=$TOOLS_ID"

# ---------------------------------------------------------------------------
# 8. Workflows
# ---------------------------------------------------------------------------
info "Creating workflows..."

# Helper: create a simple workflow via CLI (as admin)
simple_wf() {
    local name="$1" project="$2"
    if [ -n "$project" ]; then
        $CLI create-sample-workflow --name "$name" --project "$project"
    else
        $CLI create-sample-workflow --name "$name"
    fi
}

# Helper: create an approval-gated workflow via API
approval_wf() {
    local name="$1" desc="$2" project_id="$3"
    step "Creating approval-gated workflow: $name"
    curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API/workflows" \
        -H "Content-Type: application/json" \
        -d "$(cat <<WFEOF
{
    "name": "$name",
    "description": "$desc",
    "project_id": "$project_id",
    "workflow_definition": {
        "schema_version": "2.0.0",
        "name": "$name",
        "description": "$desc",
        "triggers": [{"id": "trigger_manual", "type": "manual_trigger"}],
        "nodes": [
            {"id": "prepare", "type": "script", "name": "Prepare", "config": {"language": "python", "code": "print('Preparing $name...')", "timeout": 300}},
            {"id": "review", "type": "approval", "name": "Review and approve", "config": {"timeout": 3600}},
            {"id": "execute", "type": "script", "name": "Execute", "config": {"language": "python", "code": "print('Executing $name')", "timeout": 600}},
            {"id": "rollback", "type": "script", "name": "Handle rejection", "config": {"language": "python", "code": "print('$name rejected')", "timeout": 60}}
        ],
        "edges": [
            {"from": "trigger_manual", "to": "prepare"},
            {"from": "prepare", "to": "review"},
            {"from": "review", "to": "execute", "from_port": "approved"},
            {"from": "review", "to": "rollback", "from_port": "rejected"}
        ]
    }
}
WFEOF
)" > /dev/null && step "  $name created" || warn "  $name failed"
}

# -- storefront (6 workflows) --
simple_wf "build-storefront"     "storefront"
simple_wf "run-e2e-tests"        "storefront"
simple_wf "lighthouse-audit"     "storefront"
simple_wf "cdn-cache-purge"      "storefront"
approval_wf "deploy-storefront-prod" "Deploy storefront to production" "$STOREFRONT_ID"
approval_wf "feature-flag-toggle"    "Toggle feature flags in production" "$STOREFRONT_ID"

# -- payment-service (7 workflows) --
simple_wf "build-payment-svc"    "payment-service"
simple_wf "run-integration-tests" "payment-service"
simple_wf "pci-compliance-scan"  "payment-service"
simple_wf "rotate-api-keys"      "payment-service"
simple_wf "generate-txn-report"  "payment-service"
approval_wf "deploy-payment-prod"    "Deploy payment service to production" "$PAYMENT_ID"
approval_wf "db-schema-migration"    "Apply database schema migration" "$PAYMENT_ID"

# -- data-pipeline (5 workflows) --
simple_wf "run-etl-daily"        "data-pipeline"
simple_wf "validate-data-quality" "data-pipeline"
simple_wf "sync-data-warehouse"  "data-pipeline"
simple_wf "generate-analytics"   "data-pipeline"
approval_wf "backfill-historical"    "Run historical data backfill" "$PIPELINE_ID"

# -- mobile-app (6 workflows) --
simple_wf "build-ios"            "mobile-app"
simple_wf "build-android"        "mobile-app"
simple_wf "run-device-tests"     "mobile-app"
simple_wf "screenshot-diff"      "mobile-app"
approval_wf "submit-app-store"       "Submit to App Store / Play Store" "$MOBILE_ID"
approval_wf "push-notification-blast" "Send push notification to all users" "$MOBILE_ID"

# -- internal-tools (4 workflows) --
simple_wf "build-dev-portal"     "internal-tools"
simple_wf "update-docs-site"     "internal-tools"
simple_wf "rotate-service-creds" "internal-tools"
approval_wf "infra-terraform-apply"  "Apply Terraform infrastructure changes" "$TOOLS_ID"

# -- default project (2 workflows) --
simple_wf "hello-world"         "default"
simple_wf "smoke-test"          "default"

# ---------------------------------------------------------------------------
# 9. Sample executions
# ---------------------------------------------------------------------------
info "Creating sample executions..."

get_wf_id() {
    curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API/workflows?limit=100" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
wfs = data.get('resources', data) if isinstance(data, dict) else data
for w in wfs:
    if w['name'] == '$1': print(w['id']); break
" 2>/dev/null || true
}

create_exec() {
    curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API/executions" \
        -H "Content-Type: application/json" \
        -d "{\"workflow_id\": \"$1\", \"input_data\": {}}" 2>/dev/null | python3 -c "
import sys, json
print(json.load(sys.stdin).get('id', ''))
" 2>/dev/null
}

run_wf() {
    local name="$1" user="$2"
    local wf_id
    wf_id=$(get_wf_id "$name")
    if [ -n "$wf_id" ]; then
        step "$user runs $name"
        create_exec "$wf_id" > /dev/null || warn "  execution failed"
    fi
}

run_wf "run-e2e-tests"         "frank"
run_wf "build-storefront"      "grace"
run_wf "lighthouse-audit"      "bob"
run_wf "run-integration-tests" "carol"
run_wf "pci-compliance-scan"   "alice"
run_wf "build-ios"             "frank"
run_wf "build-android"         "grace"
run_wf "run-etl-daily"         "maya"
run_wf "validate-data-quality" "nate"
run_wf "build-dev-portal"      "iris"
run_wf "hello-world"           "admin"
run_wf "smoke-test"            "hector"

# ---------------------------------------------------------------------------
# 10. Pending approval requests
# ---------------------------------------------------------------------------
info "Creating pending approval requests..."

create_approval() {
    local wf_name="$1" node_id="$2" approval_name="$3"
    local wf_id exec_id wf_version_id

    wf_id=$(get_wf_id "$wf_name")
    [ -z "$wf_id" ] && return

    wf_version_id=$(curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API/workflows/$wf_id/versions" | python3 -c "
import sys, json
data = json.load(sys.stdin)
versions = data.get('versions', data.get('resources', data)) if isinstance(data, dict) else data
if versions: print(versions[0]['id'])
" 2>/dev/null || true)
    [ -z "$wf_version_id" ] && return

    exec_id=$(create_exec "$wf_id")
    [ -z "$exec_id" ] && return

    step "Creating approval: $approval_name"
    curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API/approvals" \
        -H "Content-Type: application/json" \
        -d "$(cat <<EOF
{
    "execution_id": "$exec_id",
    "approval_node_id": "$node_id",
    "name": "$approval_name",
    "workflow_context": {
        "workflow_version_id": "$wf_version_id",
        "workflow_name": "$wf_name",
        "inputs": {}
    },
    "next_step_approved": {"id": "execute", "name": "Execute", "type": "task"},
    "next_step_rejected": {"id": "rollback", "name": "Handle rejection", "type": "task"}
}
EOF
)" > /dev/null && step "  approval created" || warn "  approval creation failed"
}

create_approval "deploy-storefront-prod"  "review" "Deploy storefront v3.2 to production"
create_approval "deploy-payment-prod"     "review" "Deploy payment-service hotfix to production"
create_approval "db-schema-migration"     "review" "Add index on transactions.created_at"
create_approval "submit-app-store"        "review" "Submit mobile-app v2.0 to App Store"
create_approval "infra-terraform-apply"   "review" "Scale up payment-service to 8 replicas"
create_approval "push-notification-blast" "review" "Black Friday sale notification to all users"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
info "Demo data seeding complete!"
echo ""
echo "Users (20):    admin + alice, bob, carol, dave, elena, frank, grace,"
echo "               hector, iris, james, karen, leo, maya, nate,"
echo "               olivia, paul, quinn, rachel, sam, tina"
echo ""
echo "Groups (10):   admins, authenticated, backend-eng, frontend-eng, sre,"
echo "               qa, data-eng, product, security, leadership,"
echo "               on-call, release-managers"
echo ""
echo "Projects (5):  default, storefront, payment-service, data-pipeline,"
echo "               mobile-app, internal-tools"
echo ""
echo "Workflows:     ~35 (mix of simple + approval-gated)"
echo "Executions:    12 sample runs"
echo "Approvals:     6 pending approval requests"
echo ""
echo "Personas:"
echo "  alice, bob         -> eng leads, system admins"
echo "  carol, dave, elena -> backend engineers"
echo "  frank, grace       -> frontend engineers"
echo "  hector, iris       -> SRE / DevOps"
echo "  james, karen, leo  -> QA engineers"
echo "  maya, nate         -> data engineers"
echo "  olivia, paul       -> product managers"
echo "  quinn              -> security engineer"
echo "  rachel, sam, tina  -> leadership / executives (read-only)"
echo ""
echo "All users have password: (same as admin)"
echo "Pending approvals are waiting to be approved or rejected."
