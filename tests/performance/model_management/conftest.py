"""Shared fixtures for Suite 14: Model Management & Selection performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Model Management KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, compute_percentile) and
helpers (poll_for_component_kpis, poll_for_metric_records,
submit_invocation, find_llm_credential_id) are defined in the
parent tests/performance/conftest.py and inherited automatically.
This file adds model-management-specific test data and helpers.

Model management tests exercise model selection and overhead via the
invocation API.  Each ``POST /api/v1/invocations`` with a ``model`` key
in ``context_data`` directs the invocation executor to use that model.

The LLM API key is resolved at execution time from a stored LLM Provider
credential.  The credential ID is discovered automatically via the
credentials API and injected into ``context_data.metadata.credential_id``.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM Provider credential** created and enabled on the deployment,
      OR ``E2E_LLM_CREDENTIAL_CONFIGURED=1`` env var set on the deployment
      with a valid ``openrouter_api_key`` in settings.

Run with:
    make test-performance
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import (
    find_llm_credential_id,
    poll_for_invocation_terminal_status,
    submit_invocation,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

LLM_COMPONENT = "llm"

PROBE_POLL_TIMEOUT = 60.0

MODEL_SELECTION_PROMPTS: dict[str, list[str]] = {
    "code_generation": [
        "Write a Python function to implement binary search",
        "Create a REST API endpoint using FastAPI",
        "Implement a linked list data structure in Python",
        "Write unit tests for a calculator module",
        "Build a CLI tool that parses CSV files",
    ],
    "creative_writing": [
        "Write a short story about an AI assistant",
        "Compose a haiku about technology",
        "Create a product description for a smart watch",
    ],
    "analysis": [
        "Analyze the trade-offs between SQL and NoSQL databases",
        "Explain the CAP theorem and its implications",
        "Compare microservices vs monolithic architecture",
    ],
    "general": [
        "What are the best practices for REST API design?",
        "Explain how container orchestration works",
        "Summarize the key features of Python 3.12",
        "How does a load balancer distribute traffic?",
    ],
}

ALL_MODEL_PROMPTS: list[str] = [prompt for prompts in MODEL_SELECTION_PROMPTS.values() for prompt in prompts]

DEFAULT_TEST_MODELS: list[str] = [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4o",
    "google/gemini-2.0-flash-001",
    "moonshotai/kimi-k2.6",
]


def get_configured_models() -> list[str]:
    """Return the list of models to test.

    Uses ``PERF_TEST_LLM_MODELS`` env var (comma-separated) if set,
    otherwise falls back to ``DEFAULT_TEST_MODELS``.
    """
    env_models = os.environ.get("PERF_TEST_LLM_MODELS", "")
    if env_models.strip():
        return [m.strip() for m in env_models.split(",") if m.strip()]
    return list(DEFAULT_TEST_MODELS)


@pytest.fixture(scope="module")
def llm_credential_id(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> str | None:
    """Discover the LLM Provider credential ID on the deployment.

    Returns the credential UUID string, or ``None`` if no LLM credential
    is found (the tests will still run but rely on the
    ``E2E_LLM_CREDENTIAL_CONFIGURED`` fallback path).
    """
    return find_llm_credential_id(nexus_api)


@pytest.fixture(scope="module")
def llm_invocation_enabled(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
    llm_credential_id: str | None,
) -> None:
    """Verify that the LLM is configured and invocations complete successfully.

    Sends a single probe invocation (with the discovered credential if
    available), waits for it to reach a terminal status, and checks that
    it did not fail with an LLM configuration error.  Skips the entire
    module when the LLM is not configured.
    """
    models = get_configured_models()
    _, ok, inv_id = submit_invocation(
        nexus_api,
        "Hello, this is a model management probe",
        model=models[0],
        credential_id=llm_credential_id,
    )
    if not ok or inv_id is None:
        pytest.skip(
            "Could not create a probe invocation. Suite 14 requires a "
            "working invocation endpoint with an LLM configured."
        )

    parsed = poll_for_invocation_terminal_status(
        nexus_api,
        inv_id,
        timeout=PROBE_POLL_TIMEOUT,
    )
    status = str(parsed.get("status", "unknown"))
    error_message = str(parsed.get("error_message", "") or "")

    if status == "failed" and "LLM" in error_message:
        cred_hint = (
            " (credential configured)"
            if llm_credential_id
            else " (no LLM credential found via API - also ensure "
            "E2E_LLM_CREDENTIAL_CONFIGURED=1 is set on the deployment)"
        )
        pytest.skip(
            f"Probe invocation failed with LLM configuration error: "
            f"{error_message}{cred_hint}. Suite 14 (Model Management) "
            f"requires a configured LLM so invocations can complete and "
            f"emit LLM_DURATION and REQUEST_DURATION metrics."
        )
