"""Shared fixtures for Suite 18: End-to-End Agentic Workflow performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the End-to-End Agentic Workflow KPIs from the Nexus Performance
Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, llm_credential_id,
llm_invocation_enabled) and helpers (compute_percentile,
poll_for_component_kpis, poll_for_metric_records, submit_invocation,
poll_until_resources_terminal, poll_for_invocation_terminal_status,
get_configured_models) are defined in the parent
tests/performance/conftest.py and inherited automatically.

Batch submission helpers (submit_invocations_batch_with_ids) are reused
from tests/performance/invocation_service/conftest.py.

Cost estimation helpers (collect_token_totals, estimate_cost,
get_model_pricing) are reused from
tests/performance/cost_tracking/conftest.py.

This file adds E2E-agentic-specific prompt data designed to trigger the
full agentic workflow path: prompt → agent routing → LLM → tool calls
→ response.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM Provider credential** created and enabled on the deployment,

Run with:
    make test-performance
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# E2E agentic workflow prompts
# ---------------------------------------------------------------------------

AGENTIC_PROMPTS: list[str] = [
    "List all available workflows and summarize their configurations",
    "Create a simple deployment pipeline and explain each step",
    "Analyze the current system health and report any issues",
    "Generate a summary of recent automation activity",
    "Describe the available tools and their capabilities",
    "Build a workflow that validates input data before processing",
    "Explain the current infrastructure setup and suggest improvements",
    "Create an automated testing workflow for a Python project",
    "Summarize the status of running executions",
    "Design a monitoring workflow with alerting for service failures",
]

COMPLEX_AGENTIC_PROMPTS: list[str] = [
    "Design a multi-stage CI/CD pipeline with build, test, and deploy steps, then explain the workflow definition",
    "Analyze the current infrastructure, identify potential bottlenecks, and create an optimization plan",
    "Create a comprehensive monitoring setup with alerting rules for all critical services",
    "Build a disaster recovery workflow that handles failover and service restoration",
    "Generate a full security audit covering access controls, network policies, and compliance requirements",
]

ALL_E2E_PROMPTS: list[str] = AGENTIC_PROMPTS + COMPLEX_AGENTIC_PROMPTS
