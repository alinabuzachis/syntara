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
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import httpx
import pytest
import structlog

if TYPE_CHECKING:
    from collections.abc import Callable
    from concurrent.futures import Future

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.api.internal_metrics import InternalMetricsApi
    from nexus_api_client.models.invocation_create_request_contextdata import (
        InvocationCreateRequestContextdata,
    )
    from nexus_api_client.types import Unset

pytestmark = pytest.mark.performance


METRICS_POLL_INTERVAL = 0.5
METRICS_POLL_TIMEOUT = 10.0
LLM_PROBE_TIMEOUT = 60.0

# Timeout for waiting for invocations to reach terminal status (seconds)
DEFAULT_INVOCATION_TIMEOUT = 120.0
# Timeout for waiting on concurrent futures (seconds)
DEFAULT_FUTURE_TIMEOUT = 30.0

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
        models = [m.strip() for m in env_models.split(",") if m.strip()]
        if models:
            return models
    return list(DEFAULT_TEST_MODELS)


# ---------------------------------------------------------------------------
# Common component names
# ---------------------------------------------------------------------------

LLM_COMPONENT = "llm"
API_SERVICE_COMPONENT = "api_service"

# ---------------------------------------------------------------------------
# Common prompt sets
# ---------------------------------------------------------------------------

LLM_TEST_PROMPTS: dict[str, list[str]] = {
    "overhead": [
        "List the steps to create a new workflow.",
        "How do I trigger a manual workflow execution?",
        "Summarize the status of my recent invocations.",
        "What agents are available for task routing?",
        "Explain how to configure a script node.",
        "Describe the workflow execution lifecycle.",
        "How do I check the result of a completed execution?",
        "What tool providers are currently registered?",
        "Help me debug a failed workflow execution.",
        "How do I add an approval step to a workflow?",
    ],
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

ALL_LLM_TEST_PROMPTS: list[str] = [p for ps in LLM_TEST_PROMPTS.values() for p in ps]

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

_AUTH_FAILURE_STATUS_CODES = frozenset({401, 403})

logger = structlog.get_logger(__name__)


def _extract_status_code(exc: Exception) -> int | None:
    """Extract HTTP status code from known exception types."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code
    from nexus_api_client.errors import UnexpectedStatus

    if isinstance(exc, UnexpectedStatus):
        return exc.status_code
    return None


def log_request_failure(exc: Exception, *, context: str) -> None:
    """Log and fail-fast on auth/permission errors.

    HTTP errors (httpx.HTTPStatusError, UnexpectedStatus) are logged without
    exc_info because their request/response objects carry Authorization and
    Cookie headers that structlog processors may serialize into CI logs.
    Only non-HTTP exceptions (timeouts, connection resets, etc.) include
    exc_info since they don't carry credential-bearing objects.
    """
    from nexus_api_client.errors import UnexpectedStatus

    status_code = _extract_status_code(exc)
    if status_code in _AUTH_FAILURE_STATUS_CODES:
        logger.error(
            "Auth failure during performance test",
            context=context,
            status_code=status_code,
        )
        msg = (
            f"Authentication/authorization failure (HTTP {status_code}) during {context}. "
            "Aborting to avoid masking a broken security layer."
        )
        raise RuntimeError(msg) from exc

    carries_http_objects = isinstance(exc, (httpx.HTTPStatusError, UnexpectedStatus))
    logger.warning(
        "Request failed during performance test",
        context=context,
        exc_type=type(exc).__name__,
        status_code=status_code,
        url=str(exc.request.url.copy_with(params=None)) if isinstance(exc, httpx.HTTPStatusError) else None,
        exc_info=not carries_http_objects,
    )


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


def make_request(
    nexus_api: NexusApiRegistry,
    *,
    limit: int | None = None,
) -> tuple[float, bool]:
    """Make a single GET /workflows request to exercise the database.

    Used in performance tests to generate read load.

    Args:
        nexus_api: Authenticated API client registry.
        limit: Maximum number of workflows to fetch per request.
            When *None*, uses the server default.

    Returns:
        Tuple of (elapsed_ms, success).

    """
    start = time.monotonic()
    try:
        kwargs: dict[str, int] = {}
        if limit is not None:
            kwargs["limit"] = limit
        r = nexus_api.workflows.list(**kwargs)
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="make_request")
        return elapsed_ms, False


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
            except Exception as exc:
                log_request_failure(exc, context="poll_for_resource_status")
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
            workflow_definition=definition,
        ),
    )
    if r.is_success and r.parsed:
        return str(r.parsed.id)
    return None


def submit_execution(
    nexus_api: NexusApiRegistry,
    workflow_id: str,
) -> tuple[float, bool, str | None]:
    """Submit a single workflow execution.

    Returns (elapsed_ms, success, execution_id).
    """
    from uuid import UUID

    from nexus_api_client.models.execution_create import ExecutionCreate

    start = time.monotonic()
    try:
        r = nexus_api.executions.create(
            body=ExecutionCreate(workflow_id=UUID(workflow_id)),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        success = r.is_success or r.status_code in (200, 201, 202)
        exec_id = str(r.parsed.id) if success and r.parsed else None
        return elapsed_ms, success, exec_id
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="submit_execution")
        return elapsed_ms, False, None


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
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="check_health")
        return elapsed_ms, False


def run_load_window(
    executor: ThreadPoolExecutor,
    nexus_api: NexusApiRegistry,
    target_rps: int,
    duration: int,
) -> tuple[int, int, float]:
    """Send requests at a steady rate for *duration* seconds.

    Spreads requests evenly across the window by submitting one request
    per ``1/target_rps`` interval (fire-and-forget into the pool).
    Completed responses are counted at the end of the window.

    Args:
        executor: Thread pool executor for concurrent request submission.
        nexus_api: Authenticated API client registry.
        target_rps: Desired requests per second to sustain.
        duration: How long (in seconds) to maintain the load.

    Returns:
        Tuple of (completed, errors, actual_rps).

    """
    interval = 1.0 / target_rps
    futures: list[Future[tuple[float, bool]]] = []
    window_start = time.monotonic()
    window_end = window_start + duration

    next_send = window_start
    while True:
        now = time.monotonic()
        if now >= window_end:
            break
        if now >= next_send:
            futures.append(executor.submit(make_request, nexus_api))
            next_send += interval
        else:
            sleep_for = min(next_send - now, 0.001)
            time.sleep(sleep_for)

    completed = 0
    errors = 0
    for future in futures:
        try:
            _, success = future.result(timeout=30)
            completed += 1
            if not success:
                errors += 1
        except Exception as exc:
            log_request_failure(exc, context="run_load_window")
            errors += 1

    wall_time = time.monotonic() - window_start
    actual_rps = completed / max(wall_time, 0.001)
    return completed, errors, actual_rps


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
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="submit_invocation")
        return elapsed_ms, False, None


def create_invocation_with_id(
    nexus_api: NexusApiRegistry,
    session_id: str,
    prompt: str = "Performance test invocation",
    credential_id: str | None = None,
) -> tuple[str | None, bool]:
    """Create a single invocation and return (invocation_id, success).

    Args:
        nexus_api: Authenticated API client registry.
        session_id: Session identifier for grouping invocations.
        prompt: Prompt text for the invocation.
        credential_id: Optional LLM Provider credential ID to inject
            into ``context_data.metadata``.

    """
    from nexus_api_client.models.invocation_create_request import InvocationCreateRequest
    from nexus_api_client.models.invocation_create_request_contextdata import (
        InvocationCreateRequestContextdata as _Ctx,
    )
    from nexus_api_client.types import UNSET

    ctx: InvocationCreateRequestContextdata | Unset = UNSET
    if credential_id:
        ctx = _Ctx.from_dict({"metadata": {"credential_id": credential_id}})

    try:
        r = nexus_api.invocation.create(
            body=InvocationCreateRequest(
                prompt=prompt,
                session_id=session_id,
                context_data=ctx,
            ),
        )
        if r.is_success and r.parsed:
            return str(r.parsed.id), True
        return None, r.is_success
    except Exception:
        return None, False


def submit_invocations_batch_with_ids(
    nexus_api: NexusApiRegistry,
    count: int,
    session_id: str,
    *,
    prompt_prefix: str = "Perf test",
    prompts: list[str] | None = None,
    max_workers: int = 10,
    credential_id: str | None = None,
) -> tuple[list[str], int]:
    """Submit *count* invocations concurrently. Returns (invocation_ids, failures).

    Args:
        nexus_api: Authenticated API client registry.
        count: Number of invocations to submit.
        session_id: Session identifier for grouping invocations.
        prompt_prefix: Prefix for auto-generated prompts.
        prompts: Optional list of prompts to cycle through.
        max_workers: Maximum concurrent threads.
        credential_id: Optional LLM Provider credential ID.

    """
    invocation_ids: list[str] = []
    failures = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                create_invocation_with_id,
                nexus_api,
                session_id,
                prompts[i % len(prompts)] if prompts else f"{prompt_prefix} {i}",
                credential_id,
            )
            for i in range(count)
        ]
        for future in as_completed(futures):
            inv_id, ok = future.result()
            if ok and inv_id:
                invocation_ids.append(inv_id)
            else:
                failures += 1

    return invocation_ids, failures


def extract_routing_decisions(
    records: dict[str, Any],
) -> list[dict[str, str]]:
    """Extract routing decisions from ``agent_routing_ms`` metric records.

    Each returned dict contains ``invocation_id`` and ``target_agent``
    extracted from the record labels.  Only records that carry a
    ``target_agent`` label are included.

    Useful for accuracy validation (comparing routed agents against
    expected agents) and utilization distribution across agents.
    """
    decisions: list[dict[str, str]] = []
    for record in records.get("records", []):
        labels = record.get("labels", {})
        target = labels.get("target_agent", "")
        inv_id = labels.get("invocation_id", "")
        if target:
            decisions.append({"invocation_id": inv_id, "target_agent": target})
    return decisions


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


def timed_http_request(
    base_url: str,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    cookies: dict[str, str] | None = None,
    timeout: float = 30.0,
    verify_ssl: bool = False,
) -> tuple[float, int, dict[str, Any]]:
    """Send a timed HTTP request and return (elapsed_ms, status_code, response_json).

    A general-purpose helper for performance tests that need to measure
    raw HTTP request latency to arbitrary endpoints.

    Args:
        base_url: Deployment base URL (e.g. ``https://nexus.apps.example.com``).
        method: HTTP method (GET, POST, etc.).
        path: URL path (e.g. ``/api/v1/auth/login``).
        headers: Optional request headers.
        json_body: Optional JSON body for POST/PUT/PATCH requests.
        cookies: Optional cookies to send with the request.
        timeout: Request timeout in seconds.
        verify_ssl: Whether to verify SSL certificates.

    Returns:
        Tuple of (elapsed_ms, status_code, response_json).  ``response_json``
        is an empty dict when the response body is not valid JSON.

    """
    url = f"{base_url.rstrip('/')}{path}"
    start = time.monotonic()
    try:
        response = httpx.request(
            method,
            url,
            headers=headers,
            json=json_body,
            cookies=cookies,
            timeout=timeout,
            verify=verify_ssl,
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        try:
            body = response.json()
        except Exception:
            body = {}
        return elapsed_ms, response.status_code, body
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="timed_http_request")
        return elapsed_ms, 0, {}


def run_concurrent_http_requests(
    base_url: str,
    method: str,
    path: str,
    count: int,
    *,
    headers: dict[str, str] | None = None,
    json_body_factory: Callable[[int], dict[str, Any] | None] | None = None,
    json_body: dict[str, Any] | None = None,
    cookies: dict[str, str] | None = None,
    max_workers: int = 50,
    timeout: float = 30.0,
    verify_ssl: bool = False,
) -> list[tuple[float, int, dict[str, Any]]]:
    """Send *count* concurrent HTTP requests and collect results.

    Args:
        base_url: Deployment base URL.
        method: HTTP method.
        path: URL path.
        count: Number of requests to send.
        headers: Optional shared request headers.
        json_body_factory: Optional callable(index) returning a JSON body dict.
            Takes precedence over *json_body*.
        json_body: Optional static JSON body (used when json_body_factory is None).
        cookies: Optional cookies to send with each request.
        max_workers: Maximum concurrent threads.
        timeout: Per-request timeout.
        verify_ssl: Whether to verify SSL certificates.

    Returns:
        List of (elapsed_ms, status_code, response_json) tuples.

    """
    results: list[tuple[float, int, dict[str, Any]]] = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = []
        for i in range(count):
            body = json_body_factory(i) if json_body_factory else json_body
            futures.append(
                executor.submit(
                    timed_http_request,
                    base_url,
                    method,
                    path,
                    headers=headers,
                    json_body=body,
                    cookies=cookies,
                    timeout=timeout,
                    verify_ssl=verify_ssl,
                )
            )
        for future in as_completed(futures):
            results.append(future.result())

    return results


def build_ws_url(base_url: str, path: str) -> str:
    """Convert an HTTP base URL to a WebSocket URL with the given path.

    Replaces ``http`` with ``ws`` and ``https`` with ``wss``, then
    appends *path*.

    Args:
        base_url: HTTP base URL (e.g. ``https://nexus.apps.example.com``).
        path: WebSocket path including leading ``/`` (e.g.
            ``/ws/workflows/v1/executions/<uuid>``).

    """
    ws_base = re.sub(r"^http", "ws", base_url, count=1)
    return f"{ws_base.rstrip('/')}{path}"


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
        except Exception as exc:
            log_request_failure(exc, context="poll_for_invocation_terminal_status")
        time.sleep(interval)

    return parsed


def wait_for_invocations(
    nexus_api: NexusApiRegistry,
    invocation_ids: list[str],
    *,
    timeout: float = DEFAULT_INVOCATION_TIMEOUT,
) -> None:
    """Wait for all invocations to reach terminal status.

    Args:
        nexus_api: Authenticated API client registry.
        invocation_ids: List of invocation IDs to wait for.
        timeout: Maximum seconds to wait per invocation.

    """
    for inv_id in invocation_ids:
        poll_for_invocation_terminal_status(nexus_api, inv_id, timeout=timeout)


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


@pytest.fixture(scope="module")
def llm_credential_id(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> str | None:
    """Discover the LLM Provider credential ID on the deployment.

    Returns the credential UUID string, or None if no LLM credential
    is found.
    """
    return find_llm_credential_id(nexus_api)


@pytest.fixture(scope="module")
def configured_model() -> str:
    """Get the first configured model or fail with helpful message.

    Returns the first model from PERF_TEST_LLM_MODELS env var or
    DEFAULT_TEST_MODELS.

    Raises:
        pytest.Failed: If no models are configured.

    """
    models = get_configured_models()
    if not models:
        pytest.fail(
            "No models configured for testing. "
            "Ensure PERF_TEST_LLM_MODELS environment variable is set or "
            "DEFAULT_TEST_MODELS contains at least one model."
        )
    return models[0]


@pytest.fixture(scope="module")
def llm_invocation_enabled(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
    llm_credential_id: str | None,
    configured_model: str,
) -> None:
    """Verify that the LLM is reachable and invocations complete via Nexus.

    Sends a probe invocation with the discovered credential, waits for
    terminal status, and skips the module if the LLM is not configured.
    """
    model = configured_model
    _, ok, inv_id = submit_invocation(
        nexus_api,
        "Hello, this is an LLM readiness probe",
        model=model,
        credential_id=llm_credential_id,
    )
    if not ok or inv_id is None:
        pytest.skip(
            "Could not create a probe invocation — the invocation API may be unavailable or the LLM is not configured."
        )

    parsed = poll_for_invocation_terminal_status(
        nexus_api,
        inv_id,
        timeout=LLM_PROBE_TIMEOUT,
    )
    status = str(parsed.get("status", "unknown"))
    error_message = str(parsed.get("error_message", "") or "")

    if status == "failed" and "LLM" in error_message:
        cred_hint = " (credential configured)" if llm_credential_id else " (no LLM credential found via API)"
        pytest.skip(
            f"Probe invocation failed with LLM error: {error_message}{cred_hint}. "
            f"A configured LLM is required for this test suite."
        )
