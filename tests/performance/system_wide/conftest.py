"""Shared fixtures for Suite 9: System-Wide performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the System-Wide KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, compute_percentile) and
helpers (poll_for_component_kpis, poll_for_metric_records,
check_health, create_perf_test_workflow, submit_execution,
submit_invocation, poll_until_resources_terminal) are defined
in the parent tests/performance/conftest.py and inherited automatically.
This file adds system-wide-specific constants and helpers.

System-wide tests exercise multiple Nexus subsystems together:
- Health checks target the deployment root (/health)
- E2E latency tests create workflows, execute them, and wait for
  completion
- Error rate tests submit mixed workloads across workflows,
  invocations, and tool calls
- Cascading failure detection measures error propagation when
  one subsystem is degraded

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import Any

SYSTEM_WIDE_COMPONENT = "system_wide"

TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})

MIXED_WORKLOAD_PROMPTS = [
    "Create a workflow that deploys my application",
    "Build a workflow to automate testing",
    "What is the weather today?",
    "Summarize this document for me",
    "Write a bash script to monitor disk usage",
    "Explain quantum computing in simple terms",
    "Help me troubleshoot a connection timeout",
    "Tell me about the history of AI",
    "Use the available tools to greet me",
    "Call a tool to get information",
]


def extract_error_records_by_endpoint(
    records: dict[str, Any],
) -> dict[str, int]:
    """Group error records by endpoint label.

    Returns a dict mapping endpoint strings to their error counts.
    """
    counts: dict[str, int] = {}
    for record in records.get("records", []):
        labels = record.get("labels", {})
        endpoint = labels.get("endpoint", labels.get("path", "unknown"))
        counts[endpoint] = counts.get(endpoint, 0) + 1
    return counts


def extract_error_records_by_service(
    records: dict[str, Any],
) -> dict[str, int]:
    """Group error records by service/category label.

    Returns a dict mapping service names to their error counts.
    """
    counts: dict[str, int] = {}
    for record in records.get("records", []):
        labels = record.get("labels", {})
        service = labels.get("category", labels.get("service", labels.get("component", "unknown")))
        counts[service] = counts.get(service, 0) + 1
    return counts
