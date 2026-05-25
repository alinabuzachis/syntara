"""Shared fixtures for Suite 7: Tool Manager performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Tool Manager KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, compute_percentile) and
helpers (poll_for_component_kpis, poll_for_metric_records,
submit_invocation, poll_for_invocation_terminal_status) are defined
in the parent tests/performance/conftest.py and inherited automatically.
This file adds tool-manager-specific test data and helpers.

Tool execution metrics are emitted as a side effect of agent
orchestration — when an invocation's agent decides to call a tool,
the ``execution_failure_handler`` wrapper records
``TOOL_EXECUTION_DURATION`` and ``TOOL_EXECUTION_STATUS`` metrics.
The performance tests exercise this path indirectly by submitting
prompts that are likely to trigger tool calls.

The ``/api/v1/tool_manager/metrics/executions`` endpoint provides
a database-backed execution history that can be queried independently
of the internal metrics store.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM model configured** — tool calls require a functioning
      orchestrator with an LLM that can select and invoke tools.
    - **At least one tool provider registered** with available tools.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import (
    poll_for_component_kpis,
    poll_for_invocation_terminal_status,
    submit_invocation,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

TOOL_MANAGER_COMPONENT = "tool_manager"

PROBE_POLL_INTERVAL = 2.0
PROBE_POLL_TIMEOUT = 60.0
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})

TOOL_TRIGGERING_PROMPTS = [
    "Use the available tools to greet me",
    "Call a tool to get information",
    "Execute a tool to help me with this task",
    "Use your tools to look up some data",
    "Invoke a tool to process this request",
    "Use any available tool to assist me",
    "Run a tool to generate a response",
    "Call an available tool and tell me the result",
    "Use a tool to answer this question: what tools do you have?",
    "Execute any tool and give me the output",
]

COMPLEX_TOOL_PROMPTS = [
    "Use a tool with multiple parameters to process this data",
    "Call a tool that requires complex input handling",
    "Execute a tool and handle the result carefully",
    "Use a tool to perform a multi-step operation",
    "Call a tool with varied arguments to test its flexibility",
]

ALL_TOOL_PROMPTS = TOOL_TRIGGERING_PROMPTS + COMPLEX_TOOL_PROMPTS


def get_tool_manager_kpis(nexus_api: NexusApiRegistry) -> dict[str, Any]:
    """Fetch tool_manager KPIs and return the metrics dict."""
    kpis = poll_for_component_kpis(
        nexus_api.internal_metrics,
        TOOL_MANAGER_COMPONENT,
    )
    metrics: dict[str, Any] = kpis.get("metrics", {})
    return metrics


def get_tool_execution_history(
    nexus_api: NexusApiRegistry,
    *,
    limit: int = 100,
    status: str | None = None,
) -> dict[str, Any]:
    """Query the tool execution history from the database-backed endpoint.

    Returns the parsed response dict with ``resources`` and pagination info.
    """
    kwargs: dict[str, Any] = {"limit": limit}
    if status is not None:
        kwargs["status"] = status
    r = nexus_api.tool_metrics.get_tool_executions(**kwargs)
    if r.is_success and r.parsed is not None:
        result: dict[str, Any] = r.parsed.to_dict()
        return result
    return {}


def get_tool_metrics_summary(
    nexus_api: NexusApiRegistry,
) -> list[dict[str, Any]]:
    """Query the per-tool metrics summary from the tool_manager metrics endpoint.

    Returns a list of per-tool summary dicts.
    """
    r = nexus_api.tool_metrics.get()
    if r.is_success and r.parsed is not None:
        parsed: dict[str, Any] = r.parsed.to_dict()
        resources: list[dict[str, Any]] = parsed.get("resources", [])
        return resources
    return []


def get_available_tool_providers(
    nexus_api: NexusApiRegistry,
) -> list[dict[str, Any]]:
    """List all registered tool providers.

    Returns a list of provider dicts.
    """
    r = nexus_api.tool_manager.get_tool_providers()
    if r.is_success and r.parsed is not None:
        parsed: dict[str, Any] = r.parsed.to_dict()
        providers: list[dict[str, Any]] = parsed.get("resources", [])
        return providers
    return []


def get_available_tools(
    nexus_api: NexusApiRegistry,
) -> list[dict[str, Any]]:
    """List all registered tools.

    Returns a list of tool dicts.
    """
    r = nexus_api.tool_manager.get_tools()
    if r.is_success and r.parsed is not None:
        parsed: dict[str, Any] = r.parsed.to_dict()
        tools: list[dict[str, Any]] = parsed.get("resources", [])
        return tools
    return []


def validate_provider(
    nexus_api: NexusApiRegistry,
    provider_id: str,
) -> tuple[float, bool]:
    """Validate a single tool provider and measure response time.

    Returns (elapsed_ms, success).
    """
    start = time.monotonic()
    try:
        r = nexus_api.tool_manager.validate_tool_provider(provider_id=provider_id)
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, False


def refresh_provider(
    nexus_api: NexusApiRegistry,
    provider_id: str,
) -> tuple[float, bool]:
    """Refresh tools for a single tool provider and measure response time.

    Returns (elapsed_ms, success).
    """
    start = time.monotonic()
    try:
        r = nexus_api.tool_manager.refresh_tool_provider(provider_id=provider_id)
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, False


@pytest.fixture(scope="module")
def tool_execution_enabled(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> None:
    """Verify that tools are available and tool execution works on the deployment.

    Sends a probe invocation with a tool-triggering prompt, waits for
    terminal status, and checks that tool execution metrics were emitted.
    Skips the entire module when tools are not configured.
    """
    tools = get_available_tools(nexus_api)
    if not tools:
        pytest.skip(
            "No tools registered on the deployment. Suite 7 (Tool Manager) "
            "requires at least one tool provider with available tools."
        )

    enabled_tools = [t for t in tools if t.get("enabled") and t.get("status") == "available"]
    if not enabled_tools:
        pytest.skip(
            f"Found {len(tools)} tools but none are enabled and available. Suite 7 requires at least one enabled tool."
        )

    _, ok, inv_id = submit_invocation(nexus_api, "Use the available tools to greet me")
    if not ok or inv_id is None:
        pytest.skip(
            "Could not create a probe invocation — the invocation API "
            "may be unavailable. Suite 7 requires a working invocation "
            "endpoint with an LLM and tools configured."
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
            f"{error_message}. Suite 7 (Tool Manager) requires a "
            f"configured LLM so the orchestrator can run and invoke tools."
        )
