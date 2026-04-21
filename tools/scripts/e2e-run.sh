#!/usr/bin/env bash
# Start the full E2E stack (mock Segment, database, Temporal, OPA, API server),
# run pytest, then tear everything down.
#
# Usage:
#   COMPOSE_CMD="uv run podman-compose -p nexus -f podman-compose.yml" \
#       ./tools/scripts/e2e-run.sh [pytest-args...]
#
# Environment:
#   COMPOSE_CMD           Full compose command with project/file args (required)
#   SEGMENT_SERVER_PORT   Mock Segment port (default: 9999)
set -euo pipefail

if [[ -z "${COMPOSE_CMD:-}" ]]; then
    echo "❌ COMPOSE_CMD is required (e.g. 'uv run podman-compose -p nexus -f podman-compose.yml')"
    exit 1
fi

SEGMENT_SERVER_PORT="${SEGMENT_SERVER_PORT:-9999}"
MAKE="${MAKE:-make}"
PYTEST_ARGS=("$@")
DEV_PID=""

cleanup() {
    echo "🧹 Stopping background services..."
    if [[ -n "$DEV_PID" ]]; then
        kill "$DEV_PID" 2>/dev/null || true
        wait "$DEV_PID" 2>/dev/null || true
    fi
    ${COMPOSE_CMD} --profile telemetry-e2e down > /dev/null 2>&1 || true
}
trap cleanup EXIT

${MAKE} _deps-install-dev

echo "🚀 Starting mock Segment, database, Temporal, and OPA..."
APP_SEGMENT_WRITE_KEY=test-e2e-write-key \
APP_SEGMENT_ENDPOINT="http://mock-segment:${SEGMENT_SERVER_PORT}" \
APP_COLLECTION_INTERVAL_SECONDS=10 \
${COMPOSE_CMD} --profile telemetry-e2e up -d database temporal temporal-worker mock-segment opa \
    > /tmp/nexus-e2e-infra.log 2>&1

echo "⏳ Waiting for mock Segment server..."
TRIES=0
until curl -sf "http://localhost:${SEGMENT_SERVER_PORT}/health" 2>/dev/null | grep -q '"status":"ok"'; do
    sleep 1
    TRIES=$((TRIES + 1))
    if [[ $TRIES -ge 30 ]]; then
        echo "❌ Mock Segment server failed to start. Logs:"
        ${COMPOSE_CMD} --profile telemetry-e2e logs mock-segment 2>&1 | tail -10
        exit 1
    fi
done
echo "✅ Mock Segment server ready"

echo "⏳ Waiting for Temporal to be ready..."
TRIES=0
until timeout 2 bash -c "echo > /dev/tcp/localhost/\${APP_TEMPORAL_PORT:-7233}" 2>/dev/null; do
    sleep 2
    TRIES=$((TRIES + 1))
    if [[ $TRIES -ge 60 ]]; then
        echo "⚠️  Temporal may not be ready — workflow execution tests may fail"
        break
    fi
done
echo "✅ Infrastructure ready"

APP_SEGMENT_WRITE_KEY=test-e2e-write-key \
APP_SEGMENT_ENDPOINT="http://localhost:${SEGMENT_SERVER_PORT}" \
APP_COLLECTION_INTERVAL_SECONDS=10 \
${MAKE} dev > /tmp/nexus-e2e-dev.log 2>&1 &
DEV_PID=$!

echo "⏳ Waiting for API server to be ready..."
TRIES=0
until curl -sf http://localhost:8000/health 2>/dev/null | grep -q '"status":"healthy"'; do
    sleep 1
    TRIES=$((TRIES + 1))
    if [[ $TRIES -ge 60 ]]; then
        echo "❌ API server failed to start after 60s. Last 20 lines:"
        tail -20 /tmp/nexus-e2e-dev.log
        exit 1
    fi
done
echo "✅ API server is ready"

SEGMENT_SERVER_URL="http://localhost:${SEGMENT_SERVER_PORT}" \
APP_BASE_URL="${APP_BASE_URL:-http://localhost:8000}" \
uv run pytest "${PYTEST_ARGS[@]}"
