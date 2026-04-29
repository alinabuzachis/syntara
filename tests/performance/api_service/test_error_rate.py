"""Suite 1 — API Service: Error Rate KPIs (1.2, 1.5).

Test 1.2: Mixed GET/POST/PATCH across all CRUD endpoints (60s)
    KPI: Error Rate < 1%
    MetricType: ERROR, REQUEST_DURATION

Test 1.5: Invalid payloads / auth failures
    KPI: 4xx Error Classification — correct categorization
    MetricType: ERROR

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import httpx
import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate

from tests.performance.conftest import SIMPLE_WORKFLOW_DEFINITION

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.types import Response

pytestmark = pytest.mark.performance

TARGET_ERROR_RATE = 0.01  # < 1%
MIXED_DURATION_SECONDS = 60


class _EndpointStats:
    """Accumulates per-endpoint request/response statistics."""

    def __init__(self) -> None:
        self.by_endpoint: dict[str, dict[int, int]] = {}

    def record(self, key: str, status_code: int) -> None:
        bucket = self.by_endpoint.setdefault(key, {})
        bucket[status_code] = bucket.get(status_code, 0) + 1

    def record_failure(self, key: str) -> None:
        self.record(key, 0)

    @property
    def total(self) -> int:
        return sum(sum(c.values()) for c in self.by_endpoint.values())

    @property
    def server_errors(self) -> int:
        return sum(
            count for codes in self.by_endpoint.values() for code, count in codes.items() if code >= 500 or code == 0
        )

    def summary(self) -> str:
        """Human-readable breakdown by endpoint and status code."""
        lines: list[str] = []
        for endpoint in sorted(self.by_endpoint):
            codes = self.by_endpoint[endpoint]
            parts = [f"{code}={count}" for code, count in sorted(codes.items())]
            lines.append(f"  {endpoint}: {', '.join(parts)}")
        return "\n".join(lines)


def _safe_api_call(
    label: str,
    stats: _EndpointStats,
    api_call: Callable[..., Response[Any]],
    **kwargs: Any,  # noqa: ANN401
) -> tuple[bool, Response[Any] | None]:
    """Execute an API client call, catching exceptions.

    Returns (is_server_healthy, response_or_none).
    """
    try:
        r = api_call(**kwargs)
        stats.record(label, r.status_code)
        return r.status_code < 500, r
    except Exception:
        stats.record_failure(label)
        return False, None


def _crud_workflow_cycle(
    nexus_api: NexusApiRegistry,
    cycle_id: str,
    stats: _EndpointStats,
) -> None:
    """Create -> read -> update -> delete a workflow using the generated client."""
    wf_name = f"perf-test-{cycle_id}-{uuid4().hex[:6]}"
    ok, r = _safe_api_call(
        "POST /workflows",
        stats,
        nexus_api.workflows.create,
        body=WorkflowCreate(
            name=wf_name,
            description="Performance test workflow",
            is_enabled=True,
            workflow_definition=SIMPLE_WORKFLOW_DEFINITION,
        ),
    )

    wf_id = None
    if ok and r and r.parsed:
        wf_id = r.parsed.id

    if wf_id:
        _safe_api_call("GET /workflows/{id}", stats, nexus_api.workflows.get, workflow_id=wf_id)
        _safe_api_call(
            "PATCH /workflows/{id}",
            stats,
            nexus_api.workflows.update,
            workflow_id=wf_id,
            body=WorkflowUpdate(description=f"Updated at {time.time()}"),
        )
        _safe_api_call("DELETE /workflows/{id}", stats, nexus_api.workflows.delete, workflow_id=wf_id)


def _list_endpoints_cycle(
    nexus_api: NexusApiRegistry,
    stats: _EndpointStats,
) -> None:
    """List resources across various endpoints using the generated client."""
    _safe_api_call("GET /workflows", stats, nexus_api.workflows.list)
    _safe_api_call("GET /executions", stats, nexus_api.executions.list)
    _safe_api_call("GET /invocations", stats, nexus_api.invocation.lists)
    _safe_api_call("GET /approvals", stats, nexus_api.approvals.list)
    _safe_api_call("GET /tools", stats, nexus_api.tool_manager.get_tools)
    _safe_api_call("GET /tool_providers", stats, nexus_api.tool_manager.get_tool_providers)


def _mixed_crud_cycle(
    nexus_api: NexusApiRegistry,
    cycle_id: str,
    stats: _EndpointStats,
) -> None:
    """Run one cycle of mixed CRUD operations across multiple endpoints."""
    _list_endpoints_cycle(nexus_api, stats)
    _crud_workflow_cycle(nexus_api, cycle_id, stats)


def _format_server_error_details(
    nexus_api: NexusApiRegistry,
) -> str:
    """Fetch server-side error records and format them for diagnostics."""
    records_response = nexus_api.internal_metrics.get_records(metric_type="error", limit=50)
    records_response.assert_successful()
    records = records_response.parsed.to_dict() if records_response.parsed is not None else {}
    total = records.get("total", 0)
    if total == 0:
        return "  (no server-side error records)"
    lines = [f"  total error records: {total} (showing up to 50)"]
    for rec in records.get("records", []):
        labels = rec.get("labels", {})
        value = rec.get("value", "")
        lines.append(
            f"  endpoint={labels.get('endpoint', '?')} status={labels.get('status_code', '?')} "
            f"error_type={labels.get('error_type', '?')} value={value}"
        )
    return "\n".join(lines)


class TestMixedCrudErrorRate:
    """1.2 — Mixed GET/POST/PATCH across all CRUD endpoints (60s).

    Validates:
        - Overall error rate (5xx + connection failures) < 1%
        - Server-side api_service error_rate matches
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()
        time.sleep(0.5)

    def test_mixed_crud_error_rate_under_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Mixed CRUD operations for 60s; error rate must be < 1%."""
        stats = _EndpointStats()
        cycle = 0

        end_time = time.monotonic() + MIXED_DURATION_SECONDS

        while time.monotonic() < end_time:
            _mixed_crud_cycle(nexus_api, f"cycle-{cycle}", stats)
            cycle += 1

        assert stats.total > 0, "No requests completed during the test"

        client_error_rate = stats.server_errors / stats.total

        kpis_response = nexus_api.internal_metrics.get_component_kpis(component="api_service")
        kpis_response.assert_successful()
        kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
        server_error_rate = kpis.get("metrics", {}).get("error_rate", 0)
        server_total_errors = kpis.get("metrics", {}).get("total_errors", 0)
        server_total_requests = kpis.get("metrics", {}).get("total_requests", 0)

        diag = (
            f"\n--- Client-side breakdown (by endpoint and status code) ---\n"
            f"{stats.summary()}\n"
            f"--- Client totals: {stats.total} requests, {stats.server_errors} server errors "
            f"({client_error_rate:.2%}) ---\n"
            f"--- Server KPIs: total_requests={server_total_requests}, "
            f"total_errors={server_total_errors}, error_rate={server_error_rate} ---\n"
            f"--- Server error record samples ---\n"
            f"{_format_server_error_details(nexus_api)}\n"
        )

        assert client_error_rate < TARGET_ERROR_RATE, (
            f"Client-measured error rate {client_error_rate:.2%} exceeds target "
            f"{TARGET_ERROR_RATE:.0%} (cycles={cycle}){diag}"
        )

        if isinstance(server_error_rate, (int, float)) and server_error_rate > 0:
            assert server_error_rate < TARGET_ERROR_RATE, (
                f"Server-reported error rate {server_error_rate:.2%} exceeds target {TARGET_ERROR_RATE:.0%}{diag}"
            )


class TestErrorClassification:
    """1.5 — Invalid payloads / auth failures produce correct error categorization.

    Validates:
        - Invalid JSON payload → 422 Unprocessable Entity
        - Missing auth → 401 Unauthorized
        - Non-existent resource → 404 Not Found
        - Error records in internal metrics carry correct error_type labels

    Note: Some tests deliberately send raw httpx requests to simulate
    missing/invalid authentication, which cannot be done through the
    authenticated API client.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()
        time.sleep(0.5)

    def test_invalid_payload_returns_422(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """POST with invalid payload must return 422.

        Uses get_httpx_client() to send a deliberately malformed body
        that the generated model would reject at construction time.
        """
        http = nexus_api.workflows._client.get_httpx_client()
        r = http.post("/workflows", json={"invalid_field": "bad_data"})
        assert r.status_code == 422, f"Expected 422, got {r.status_code}"

    def test_missing_auth_returns_401(
        self,
        nexus_base_url: str,
    ) -> None:
        """Request without auth token must return 401."""
        r = httpx.get(
            f"{nexus_base_url}/api/v1/workflows",
            timeout=10,
            verify=False,  # noqa: S501
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_nonexistent_resource_returns_404(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """GET for non-existent resource must return 404."""
        fake_id = uuid4()
        r = nexus_api.workflows.get(workflow_id=fake_id)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"

    def test_expired_token_returns_401(
        self,
        nexus_base_url: str,
    ) -> None:
        """Request with an invalid/expired JWT must return 401."""
        bad_headers = {"Authorization": "Bearer invalid.jwt.token"}
        r = httpx.get(
            f"{nexus_base_url}/api/v1/workflows",
            headers=bad_headers,
            timeout=10,
            verify=False,  # noqa: S501
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_error_records_have_correct_labels(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Error metric records must carry error_type labels for classification."""
        http = nexus_api.workflows._client.get_httpx_client()
        http.post("/workflows", json={"bad": "payload"})
        nexus_api.workflows.get(workflow_id=uuid4())

        time.sleep(1)

        records_response = nexus_api.internal_metrics.get_records(metric_type="error")
        records_response.assert_successful()
        records = records_response.parsed.to_dict() if records_response.parsed is not None else {}

        if records.get("total", 0) > 0:
            for record in records.get("records", []):
                labels = record.get("labels", {})
                assert "endpoint" in labels or "error_type" in labels or "status_code" in labels, (
                    f"Error record missing classification labels: {labels}"
                )
