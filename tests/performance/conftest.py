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

import logging
import re
import time
from typing import TYPE_CHECKING, Any

import httpx
import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.api.internal_metrics import InternalMetricsApi
    from nexus_api_client.models.invocation_create_request_contextdata import (
        InvocationCreateRequestContextdata,
    )
    from nexus_api_client.types import Unset

pytestmark = pytest.mark.performance

METRICS_POLL_INTERVAL = 0.5
METRICS_POLL_TIMEOUT = 10.0


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


def poll_for_component_kpis(
    internal_metrics: InternalMetricsApi,
    component: str,
    *,
    timeout: float = METRICS_POLL_TIMEOUT,
    interval: float = METRICS_POLL_INTERVAL,
) -> dict[str, Any]:
    """Poll component KPIs until metrics appear or timeout is reached.

    Returns the parsed KPI dict (may be empty if the server never
    populates the component's metrics within the timeout window).
    """
    deadline = time.monotonic() + timeout
    kpis: dict[str, Any] = {}

    while time.monotonic() < deadline:
        r = internal_metrics.get_component_kpis(component=component)
        r.assert_successful()
        kpis = r.parsed.to_dict() if r.parsed is not None else {}
        if kpis.get("metrics"):
            return kpis
        time.sleep(interval)

    return kpis


def poll_for_metric_records(
    internal_metrics: InternalMetricsApi,
    metric_type: str,
    *,
    limit: int = 100,
    timeout: float = METRICS_POLL_TIMEOUT,
    interval: float = METRICS_POLL_INTERVAL,
) -> dict[str, Any]:
    """Poll metric records until at least one appears or timeout is reached."""
    deadline = time.monotonic() + timeout
    records: dict[str, Any] = {}

    while time.monotonic() < deadline:
        r = internal_metrics.get_records(metric_type=metric_type, limit=limit)
        r.assert_successful()
        records = r.parsed.to_dict() if r.parsed is not None else {}
        if records.get("total", 0) > 0:
            return records
        time.sleep(interval)

    return records


TERMINAL_STATUSES = {"completed", "failed", "cancelled"}

RESOURCE_POLL_INTERVAL = 2.0
RESOURCE_POLL_TIMEOUT = 120.0


def poll_until_resources_terminal(
    nexus_api: NexusApiRegistry,
    resource_type: str,
    resource_ids: list[str],
    *,
    id_param: str,
    timeout: float = RESOURCE_POLL_TIMEOUT,
    interval: float = RESOURCE_POLL_INTERVAL,
) -> dict[str, int]:
    """Poll until all resources reach a terminal status or timeout.

    Supports any API resource that exposes a ``.get()`` method returning
    a response with a ``parsed.status`` attribute (e.g. invocations,
    executions).

    Args:
        nexus_api: Authenticated API client registry.
        resource_type: API attribute name on nexus_api (e.g. "invocation",
            "executions").
        resource_ids: List of resource IDs to poll.
        id_param: Keyword argument name for the resource ID in the
            ``.get()`` call (e.g. "execution_id", "invocation_id").
        timeout: Maximum seconds to wait for terminal states.
        interval: Seconds between poll cycles.

    Returns:
        Dict mapping status strings to their counts.

    """
    api = getattr(nexus_api, resource_type)
    deadline = time.monotonic() + timeout
    status_counts: dict[str, int] = {}

    while time.monotonic() < deadline:
        status_counts = {}
        for rid in resource_ids:
            try:
                r = api.get(**{id_param: rid})
                if r.is_success and r.parsed:
                    status = str(r.parsed.status)
                    status_counts[status] = status_counts.get(status, 0) + 1
            except Exception:
                pass
        terminal = sum(v for k, v in status_counts.items() if k in TERMINAL_STATUSES)
        if terminal >= len(resource_ids):
            break
        time.sleep(interval)

    return status_counts


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


def check_health(
    base_url: str,
    *,
    verify_ssl: bool = False,
    timeout: float = 10.0,
) -> tuple[float, bool]:
    """Send a GET /health request and measure response time.

    Returns (elapsed_ms, is_healthy).
    """
    start = time.monotonic()
    try:
        response = httpx.get(
            f"{base_url}/health",
            timeout=timeout,
            verify=verify_ssl,
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, response.status_code == 200
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


def submit_invocation(
    nexus_api: NexusApiRegistry,
    prompt: str,
    session_id: str | None = None,
    model: str | None = None,
    credential_id: str | None = None,
) -> tuple[float, bool, str | None]:
    """Submit a single invocation and measure API response time.

    When *model* is provided it is passed via ``context_data`` so the
    invocation executor selects it instead of the deployment default.
    When *credential_id* is provided it is injected into
    ``context_data.metadata`` so the executor resolves the LLM API key
    from the stored credential.

    Returns (elapsed_ms, success, invocation_id).
    """
    from uuid import uuid4

    from nexus_api_client.models.invocation_create_request import InvocationCreateRequest
    from nexus_api_client.types import UNSET

    sid = session_id or uuid4().hex
    ctx: InvocationCreateRequestContextdata | Unset = UNSET
    if model or credential_id:
        from nexus_api_client.models.invocation_create_request_contextdata import (
            InvocationCreateRequestContextdata as _Ctx,
        )

        ctx_dict: dict[str, object] = {}
        if model:
            ctx_dict["model"] = model
        if credential_id:
            ctx_dict["metadata"] = {"credential_id": credential_id}
        ctx = _Ctx.from_dict(ctx_dict)

    start = time.monotonic()
    try:
        r = nexus_api.invocation.create(
            body=InvocationCreateRequest(
                prompt=prompt,
                session_id=sid,
                context_data=ctx,
            ),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        inv_id = str(r.parsed.id) if r.is_success and r.parsed else None
        return elapsed_ms, r.is_success or r.status_code in (200, 201, 202), inv_id
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, False, None


_logger = logging.getLogger(__name__)


def find_llm_credential_id(nexus_api: NexusApiRegistry) -> str | None:
    """Discover the first enabled LLM Provider credential on the deployment.

    First resolves the credential type ID for "LLM Provider" via the
    credential types API, then queries credentials filtered by that type.
    Returns the credential UUID string, or ``None`` when none is found.
    """
    try:
        llm_type_id = _find_llm_credential_type_id(nexus_api)
        if not llm_type_id:
            return None

        from uuid import UUID as _UUID

        r = nexus_api.credentials.list(credential_type_id=_UUID(llm_type_id), enabled=True)
        if not (r.is_success and r.parsed):
            return None

        resources = getattr(r.parsed, "resources", None) or []
        for cred in resources:
            cred_id = getattr(cred, "id", None)
            if cred_id is not None:
                return str(cred_id)
    except Exception:
        _logger.warning("Failed to discover LLM credential", exc_info=True)
    return None


def _find_llm_credential_type_id(nexus_api: NexusApiRegistry) -> str | None:
    """Return the credential type ID whose name contains 'LLM'."""
    try:
        r = nexus_api.credentials.list_types()
        if not (r.is_success and r.parsed):
            return None
        resources = getattr(r.parsed, "resources", None) or []
        for ct in resources:
            name = str(getattr(ct, "name", "") or "")
            if "llm" in name.lower():
                ct_id = getattr(ct, "id", None)
                if ct_id is not None:
                    return str(ct_id)
    except Exception:
        _logger.warning("Failed to list credential types", exc_info=True)
    return None


def poll_for_invocation_terminal_status(
    nexus_api: NexusApiRegistry,
    invocation_id: str,
    *,
    timeout: float = 60.0,
    interval: float = 2.0,
    terminal_statuses: frozenset[str] = frozenset({"completed", "failed", "cancelled"}),
) -> dict[str, Any]:
    """Poll an invocation until it reaches a terminal status or timeout.

    Returns the parsed invocation dict (may still be non-terminal on timeout).
    """
    deadline = time.monotonic() + timeout
    parsed: dict[str, Any] = {}

    while time.monotonic() < deadline:
        try:
            r = nexus_api.invocation.get(invocation_id=invocation_id)
            if r.is_success and r.parsed:
                parsed = r.parsed.to_dict()
                if str(parsed.get("status", "")) in terminal_statuses:
                    return parsed
        except Exception:
            pass
        time.sleep(interval)

    return parsed


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
