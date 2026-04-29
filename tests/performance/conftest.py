"""Pytest configuration for performance tests.

All tests in this directory and subdirectories are automatically marked
with @pytest.mark.performance and excluded from default test runs.

The core live-deployment fixtures (nexus_base_url, auth_headers,
nexus_client, nexus_api) are defined in the root tests/conftest.py and
inherited automatically.  This file adds shared performance-specific
helpers and fixtures used across all suites.

Suite-specific fixtures belong in each suite's own ``conftest.py``.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)

Run with: pytest --run-performance
"""

from __future__ import annotations

import re
import time
from typing import TYPE_CHECKING, Any

import httpx
import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance


# ---------------------------------------------------------------------------
# Common test data
# ---------------------------------------------------------------------------

SIMPLE_WORKFLOW_DEFINITION: dict[str, Any] = {
    "schema_version": "2.0.0",
    "triggers": [
        {
            "id": "trigger_manual",
            "type": "manual_trigger",
            "config": {"inputs": {}},
        }
    ],
    "nodes": [
        {
            "id": "script_task",
            "name": "Script Task",
            "type": "script",
            "config": {"language": "python", "code": "print('hello')"},
        }
    ],
    "edges": [
        {"from": "trigger_manual", "to": "script_task"},
    ],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def compute_percentile(values: list[float], percentile: float) -> float:
    """Compute a percentile from a sorted list of values.

    Uses linear interpolation matching the internal metrics API.
    """
    if not 0 <= percentile <= 100:
        msg = f"percentile must be between 0 and 100, got {percentile}"
        raise ValueError(msg)
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    k = (n - 1) * (percentile / 100)
    f = int(k)
    c = f + 1
    if c >= n:
        return sorted_vals[-1]
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])


def create_perf_test_workflow(
    nexus_api: NexusApiRegistry,
    name_prefix: str,
    workflow_definition: dict[str, Any] | None = None,
) -> str | None:
    """Create a workflow via the API and return its ID, or None on failure.

    Args:
        nexus_api: Authenticated API client registry.
        name_prefix: Prefix for the workflow name (a random suffix is appended).
        workflow_definition: V2 workflow definition dict.  Defaults to
            ``SIMPLE_WORKFLOW_DEFINITION``.

    """
    from uuid import uuid4

    from nexus_api_client.models.workflow_create import WorkflowCreate

    definition = workflow_definition or SIMPLE_WORKFLOW_DEFINITION
    r = nexus_api.workflows.create(
        body=WorkflowCreate(
            name=f"{name_prefix}-{uuid4().hex[:8]}",
            description="Performance test workflow",
            is_enabled=True,
            workflow_definition=definition,
        ),
    )
    if r.is_success and r.parsed:
        return str(r.parsed.id)
    return None


def submit_execution(
    nexus_api: NexusApiRegistry,
    workflow_id: str,
) -> tuple[float, bool]:
    """Submit a single workflow execution.

    Returns (elapsed_ms, success).
    """
    from uuid import UUID

    from nexus_api_client.models.execution_create import ExecutionCreate

    start = time.monotonic()
    try:
        r = nexus_api.executions.create(
            body=ExecutionCreate(workflow_id=UUID(workflow_id)),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success or r.status_code in (200, 201, 202)
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, False


def scrape_prometheus_metric(
    base_url: str,
    metric_name: str,
    *,
    verify_ssl: bool = False,
) -> list[tuple[dict[str, str], float]]:
    """Scrape the Prometheus /metrics endpoint and extract samples for a metric.

    Returns a list of (labels_dict, value) tuples for all lines matching
    *metric_name*.  Handles the standard Prometheus text exposition format.
    """
    response = httpx.get(
        f"{base_url}/metrics",
        timeout=10,
        verify=verify_ssl,
    )
    response.raise_for_status()

    pattern = re.compile(
        rf"^{re.escape(metric_name)}"
        r"(?:\{(?P<labels>[^}]*)\})?\s+(?P<value>[^\s]+)",
    )

    results: list[tuple[dict[str, str], float]] = []
    for line in response.text.splitlines():
        m = pattern.match(line)
        if m:
            labels_str = m.group("labels") or ""
            labels: dict[str, str] = {}
            if labels_str:
                for pair in re.findall(r'(\w+)="([^"]*)"', labels_str):
                    labels[pair[0]] = pair[1]
            try:
                value = float(m.group("value"))
            except ValueError:
                continue
            results.append((labels, value))
    return results


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def perf_test_mode_enabled(
    nexus_api: NexusApiRegistry,
) -> None:
    """Verify that metrics.perf_test_mode is enabled on the target instance.

    If the internal metrics summary endpoint returns 404, perf_test_mode is
    disabled and we skip the entire module.
    """
    try:
        r = nexus_api.internal_metrics.get_summary()
    except Exception as exc:
        pytest.skip(f"Cannot reach metrics endpoint: {exc}")

    if r.status_code == 404:
        pytest.skip(
            "metrics.perf_test_mode is disabled on the target instance. "
            "Enable it via the settings API before running performance tests."
        )
