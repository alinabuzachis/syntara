#!/usr/bin/env bash
# Run visual regression tests inside a Linux container that matches CI.
#
# Usage:
#   ./scripts/visual-regression-container.sh             # compare mode
#   ./scripts/visual-regression-container.sh --update     # update baselines
set -euo pipefail

# --- Preflight: verify Podman ---
if ! command -v podman &>/dev/null; then
  echo "Error: Podman is not installed or not in PATH"
  echo "Install Podman: https://podman.io/getting-started/installation"
  echo ""
  echo "On macOS:  brew install podman && podman machine init && podman machine start"
  exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  if ! podman machine info &>/dev/null 2>&1; then
    echo "Error: Podman machine is not running."
    echo "Start it with: podman machine start"
    exit 1
  fi

  MIN_MEMORY_MB=4096
  MACHINE_MEMORY=$(podman machine inspect --format '{{.Resources.Memory}}' 2>/dev/null || echo "0")
  if [[ "${MACHINE_MEMORY}" -lt "${MIN_MEMORY_MB}" ]]; then
    echo "Error: Podman machine has ${MACHINE_MEMORY}MB RAM. At least ${MIN_MEMORY_MB}MB is required."
    echo "Increase it with:"
    echo "  podman machine stop && podman machine set --memory ${MIN_MEMORY_MB} && podman machine start"
    exit 1
  fi
fi

# --- Resolve paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Extract Playwright version from lockfile ---
PW_VERSION=$(grep -A3 '"node_modules/@playwright/test"' "${REPO_ROOT}/package-lock.json" \
  | grep '"version"' \
  | head -1 \
  | sed 's/.*"version": *"\([^"]*\)".*/\1/')

if [[ -z "${PW_VERSION}" ]]; then
  echo "Error: Could not determine Playwright version from package-lock.json"
  exit 1
fi

if [[ ! "${PW_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Playwright version '${PW_VERSION}' does not look like a valid semver string"
  exit 1
fi

IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"
echo "Using Playwright image: ${IMAGE}"

# --- Parse arguments ---
UPDATE_FLAG=""
if [[ "${1:-}" == "--update" || "${1:-}" == "--update-snapshots" ]]; then
  UPDATE_FLAG="--update-snapshots"
  echo "Mode: update baselines"
else
  echo "Mode: compare against existing baselines"
fi
echo ""

SNAPSHOT_DIR="packages/nexus-ui/e2e/visual-regression/page-screenshots.spec.ts-snapshots"
API_PORT=3300
UI_PORT=4173

# --- Run the container ---
# Source is copied to /work (excluding node_modules/.git) so npm ci installs
# Linux-native binaries without corrupting the host. The build + servers run
# manually because the Vite build exceeds Playwright's default 180s webServer
# timeout under emulation. Updated snapshots are copied back to the host.
set +e
podman run --rm \
  --platform linux/amd64 \
  -v "${REPO_ROOT}:/repo:ro" \
  -v "${REPO_ROOT}/${SNAPSHOT_DIR}:/output" \
  "${IMAGE}" \
  bash -c "
    set -euo pipefail

    cleanup() { kill \$(jobs -p) 2>/dev/null || true; }
    trap cleanup EXIT

    echo '--- Copying source files ---'
    mkdir -p /work
    (cd /repo && tar cf - \
      --exclude='node_modules' \
      --exclude='.git' \
      --exclude='test-results' \
      --exclude='playwright-report' \
      .) | (cd /work && tar xf -)
    cd /work

    echo '--- Installing dependencies ---'
    npm ci --no-fund --no-audit

    echo ''
    echo '--- Building app (production) ---'
    VITE_API_URL=http://localhost:${API_PORT} npm run build --prefix packages/nexus-ui

    echo ''
    echo '--- Starting mock API and preview server ---'
    PORT=${API_PORT} npm run start --prefix packages/syntara-mock-api &
    (cd packages/nexus-ui && npx vite preview --port ${UI_PORT}) &

    echo 'Waiting for servers...'
    for i in \$(seq 1 60); do
      API_OK=\$(curl -so /dev/null -w '%{http_code}' http://localhost:${API_PORT}/api/v1/workflows 2>/dev/null || echo '000')
      UI_OK=\$(curl -so /dev/null -w '%{http_code}' http://localhost:${UI_PORT} 2>/dev/null || echo '000')
      if [[ \$API_OK =~ ^[23] ]] && [[ \$UI_OK =~ ^[23] ]]; then
        echo \"Servers ready (API: \${API_OK}, UI: \${UI_OK}).\"
        break
      fi
      if [[ \$i -eq 60 ]]; then
        echo \"Error: Servers did not start within 60 seconds (API: \${API_OK}, UI: \${UI_OK}).\"
        exit 1
      fi
      sleep 1
    done

    echo ''
    echo '--- Running visual regression tests ---'
    TEST_EXIT=0
    cd packages/nexus-ui
    NEXUS_E2E_BASE_URL=http://localhost:${UI_PORT} \
    NEXUS_E2E_API_PORT=${API_PORT} \
    npx playwright test e2e/visual-regression/page-screenshots.spec.ts ${UPDATE_FLAG} || TEST_EXIT=\$?

    echo ''
    echo '--- Copying snapshots to host ---'
    cp -r e2e/visual-regression/page-screenshots.spec.ts-snapshots/. /output/
    COPY_EXIT=\$?
    if [[ \$COPY_EXIT -ne 0 ]]; then
      echo \"Error: Failed to copy snapshots to host (exit code \${COPY_EXIT})\"
      exit 1
    fi

    exit \${TEST_EXIT}
  "
EXIT_CODE=$?
set -e

echo ""
if [[ -n "${UPDATE_FLAG}" ]]; then
  echo "Baselines updated. Review changes with:"
  echo "  git diff --stat ${SNAPSHOT_DIR}/"
else
  if [[ ${EXIT_CODE} -eq 0 ]]; then
    echo "Visual regression tests passed."
  else
    echo "Visual regression tests failed (exit code ${EXIT_CODE})."
    echo "Run with --update to accept intentional changes:"
    echo "  npm run e2e:visual-regression:container:update"
  fi
fi

exit ${EXIT_CODE}
