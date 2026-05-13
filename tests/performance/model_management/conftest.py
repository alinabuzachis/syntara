"""Shared fixtures for Suite 14: Model Management & Selection performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Model Management KPIs from the Nexus Performance Test Plan.

Shared fixtures (perf_test_mode_enabled, llm_credential_id,
llm_invocation_enabled) and helpers (compute_percentile,
poll_for_component_kpis, poll_for_metric_records, submit_invocation,
find_llm_credential_id, poll_for_invocation_terminal_status) are defined
in the parent tests/performance/conftest.py and inherited automatically.
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

LLM_COMPONENT = "llm"

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
