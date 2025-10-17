#!/bin/bash
# Run E2E pytest tests for Nexus agents
#
# This script loads environment variables from .env and runs pytest tests
# against real agent instances.
#
# Usage:
#   ./scripts/run-e2e-tests.sh                          # Run all E2E tests
#   ./scripts/run-e2e-tests.sh test_react_agent_a2a.py # Run specific test file
#   ./scripts/run-e2e-tests.sh -k test_example_1       # Run tests matching pattern
#
# Requirements:
#   - Agent must be running (e.g., podman-compose up -d generic-agent)
#   - .env file with OPENROUTER_API_KEY

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create it with OPENROUTER_API_KEY"
    exit 1
fi

# Load environment variables from .env
echo "Loading environment variables from .env..."
set -a
source .env
set +a

# Verify API key is set
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "❌ OPENROUTER_API_KEY not set in .env"
    exit 1
fi

echo "✅ OPENROUTER_API_KEY loaded"

# Check if agent is running
echo "Checking if generic-agent is running..."
if curl -s http://localhost:8001/.well-known/agent-card.json > /dev/null 2>&1; then
    echo "✅ generic-agent is running"
else
    echo "❌ generic-agent is not running. Start it with: podman-compose up -d generic-agent"
    exit 1
fi

# Run pytest with uv to ensure dependencies are available
echo ""
echo "Running E2E tests..."
echo "===================="
echo ""

# Run all E2E tests recursively
# - tests/e2e/generic_agent/ contains HTTP protocol and A2A client tests
# - Additional agent test suites can be added under tests/e2e/
# Use --confcutdir to prevent loading parent conftest.py which requires nexus.api
PYTHONPATH=src uv run pytest tests/e2e/ -v -s --confcutdir=tests/e2e "$@"
