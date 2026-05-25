"""Shared fixtures for Suite 6: Routing Service performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Routing Service KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, compute_percentile) and
helpers (poll_for_component_kpis, poll_for_metric_records) are defined
in the parent tests/performance/conftest.py and inherited automatically.
This file adds routing-service-specific test data and helpers.

The routing service is exercised via the invocation API — each
``POST /api/v1/invocations`` triggers the OrchestratorAgent which
records ``AGENT_ROUTING_DURATION`` and ``AGENT_STATUS`` metrics.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM model configured** — an OpenRouter API key or stored LLM
      credential must be available on the deployment.  The invocation
      API accepts requests without an LLM, but the background executor
      will fail with ``LLMConfigurationError`` before the orchestrator
      routing logic runs, so no ``AGENT_ROUTING_DURATION`` or
      ``AGENT_STATUS`` metrics will be emitted.

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import (
    poll_for_invocation_terminal_status,
    submit_invocation,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

ROUTING_SERVICE_COMPONENT = "routing_service"

PROBE_POLL_INTERVAL = 2.0
PROBE_POLL_TIMEOUT = 30.0
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})

WORKFLOW_PROMPTS = [
    "Create a workflow that deploys my application",
    "Build a workflow to automate testing",
    "Generate a CI/CD pipeline workflow",
    "Design an automated deployment workflow",
    "Make a workflow that runs my integration tests",
]

GENERAL_PROMPTS = [
    "What is the weather today?",
    "Summarize this document for me",
    "Write a Python script to sort a list",
    "Explain quantum computing in simple terms",
    "Help me debug this error in my code",
    "Tell me about the history of AI",
    "How do I optimize my database queries?",
    "What are the best practices for REST APIs?",
    "Translate this text to Spanish",
    "Generate a report from this data",
]

ALL_PROMPTS = WORKFLOW_PROMPTS + GENERAL_PROMPTS


@pytest.fixture(scope="module")
def llm_routed_invocation_enabled(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> None:
    """Verify that the LLM and orchestrator are configured on the deployment.

    Sends a single probe invocation, waits for it to reach a terminal
    status, and checks that it did not fail with an LLM configuration
    error.  If the orchestrator never runs, routing metrics will never
    be emitted and every test in this suite would be meaningless.

    Skips the entire module when the LLM is not configured.
    """
    _, ok, inv_id = submit_invocation(nexus_api, "Hello, this is a routing probe")
    if not ok or inv_id is None:
        pytest.skip(
            "Could not create a probe invocation — the invocation API "
            "may be unavailable. Suite 6 requires a working invocation "
            "endpoint with an LLM configured."
        )

    parsed = poll_for_invocation_terminal_status(
        nexus_api,
        inv_id,
        timeout=PROBE_POLL_TIMEOUT,
        interval=PROBE_POLL_INTERVAL,
    )
    status = str(parsed.get("status", "created"))
    error_message = str(parsed.get("error_message", "") or "")

    if status == "failed" and "LLM" in error_message:
        pytest.skip(
            f"Probe invocation failed with LLM configuration error: "
            f"{error_message}. Suite 6 (Routing Service) requires a "
            f"configured LLM so the orchestrator can run and emit "
            f"AGENT_ROUTING_DURATION metrics."
        )
