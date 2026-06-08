#!/usr/bin/env bash
# Detect Podman/Docker and run a command with the testcontainers environment.
#
# Usage:
#   PODMAN_SOCK=/path/to/sock ./tools/scripts/run-with-testcontainers.sh \
#       --label "🧪 Running tests" -- uv run pytest tests/
#
# Environment:
#   PODMAN_SOCK  Path to the Podman socket (auto-detected when unset)
set -euo pipefail

LABEL=""
COMMAND=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --label) LABEL="$2"; shift 2 ;;
        --) shift; COMMAND=("$@"); break ;;
        *) COMMAND=("$@"); break ;;
    esac
done

if [[ ${#COMMAND[@]} -eq 0 ]]; then
    echo "Usage: $0 [--label MESSAGE] -- COMMAND [ARGS...]"
    exit 1
fi

if [[ -z "${PODMAN_SOCK:-}" ]]; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
        for candidate in \
            "${HOME}/.local/share/containers/podman/machine/podman.sock" \
            "$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null || true)" \
            "/var/run/podman/podman.sock"; do
            if [[ -n "$candidate" && -S "$candidate" ]]; then
                PODMAN_SOCK="$candidate"
                break
            fi
        done
    else
        PODMAN_SOCK="/run/user/$(id -u)/podman/podman.sock"
    fi
fi

if command -v podman >/dev/null 2>&1 && [[ -S "${PODMAN_SOCK:-}" ]]; then
    echo "${LABEL} with Podman..."
    export DOCKER_HOST="unix://${PODMAN_SOCK}"
    export TESTCONTAINERS_RYUK_DISABLED=true
    exec "${COMMAND[@]}"
elif command -v docker >/dev/null 2>&1; then
    echo "${LABEL} with Docker..."
    export TESTCONTAINERS_RYUK_DISABLED=true
    exec "${COMMAND[@]}"
elif command -v podman >/dev/null 2>&1; then
    echo "❌ Podman socket not found at ${PODMAN_SOCK:-<unset>}"
    if [[ "$(uname -s)" == "Darwin" ]]; then
        echo "   Start it with: podman machine start"
    else
        echo "   Start it with: systemctl --user enable --now podman.socket"
    fi
    exit 1
else
    echo "❌ No container runtime available. Install Podman or Docker."
    exit 1
fi
