"""Suite 1 — API Service: Response Time KPIs (1.1, 1.4).

Test 1.1: Sustained GET requests to /api/v1/workflows (100 RPS, 60s)
    KPI: Response Time p95 < 200ms
    MetricType: REQUEST_DURATION

Test 1.4: Concurrent POST /api/v1/invocations (50 concurrent)
    KPI: Response Time p99 < 500ms
    MetricType: REQUEST_DURATION

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

from tests.performance.conftest import (
    compute_percentile,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_P95_MS = 200
TARGET_P99_MS = 500
SUSTAINED_DURATION_SECONDS = 60
TARGET_RPS = 100
CONCURRENT_INVOCATIONS = 50


class TestSustainedGetResponseTime:
    """1.1 — Sustained GET /api/v1/workflows at ~100 RPS for 60s.

    Validates:
        - Client-measured p95 response time < 200ms
        - Server-side KPI (api_service → response_time_ms.p95) < 200ms
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()
        time.sleep(0.5)

    def test_sustained_get_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """GET /api/v1/workflows at sustained rate; p95 must be < 200ms."""
        response_times: list[float] = []
        errors = 0

        interval = 1.0 / TARGET_RPS
        end_time = time.monotonic() + SUSTAINED_DURATION_SECONDS

        while time.monotonic() < end_time:
            batch_start = time.monotonic()

            start = time.monotonic()
            try:
                r = nexus_api.workflows.list()
                elapsed_ms = (time.monotonic() - start) * 1000
                response_times.append(elapsed_ms)
                if not r.is_success:
                    errors += 1
            except Exception:
                elapsed_ms = (time.monotonic() - start) * 1000
                response_times.append(elapsed_ms)
                errors += 1

            elapsed = time.monotonic() - batch_start
            sleep_for = interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)

        assert len(response_times) > 0, "No requests completed during the test"

        client_p95 = compute_percentile(response_times, 95)

        kpis_response = nexus_api.internal_metrics.get_component_kpis(component="api_service")
        kpis_response.assert_successful()
        kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
        server_p95 = kpis.get("metrics", {}).get("response_time_ms", {}).get("p95", 0)

        actual_rps = len(response_times) / SUSTAINED_DURATION_SECONDS
        error_rate = errors / len(response_times) if response_times else 1.0

        assert client_p95 < TARGET_P95_MS, (
            f"Client-measured p95 response time {client_p95:.1f}ms exceeds target {TARGET_P95_MS}ms "
            f"(requests={len(response_times)}, actual_rps={actual_rps:.1f}, error_rate={error_rate:.2%})"
        )

        if server_p95 > 0:
            assert server_p95 < TARGET_P95_MS, (
                f"Server-reported p95 response time {server_p95:.1f}ms exceeds target {TARGET_P95_MS}ms"
            )


class TestConcurrentInvocationsResponseTime:
    """1.4 — Concurrent POST /api/v1/invocations (50 concurrent).

    Validates:
        - Client-measured p99 response time < 500ms
        - Server-side KPI reflects the concurrent load

    This test creates invocations (which will fail if no LLM is configured,
    but we measure the API response time for the creation request itself,
    not the invocation completion).
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()
        time.sleep(0.5)

    @staticmethod
    def _create_invocation(
        nexus_api: NexusApiRegistry,
        session_id: str,
    ) -> tuple[float, int]:
        """Create a single invocation and return (elapsed_ms, status_code)."""
        from nexus_api_client.models.invocation_create_request import InvocationCreateRequest

        start = time.monotonic()
        try:
            r = nexus_api.invocation.create(
                body=InvocationCreateRequest(
                    prompt="Say hello",
                    session_id=session_id,
                ),
            )
            elapsed_ms = (time.monotonic() - start) * 1000
            return elapsed_ms, r.status_code
        except Exception:
            elapsed_ms = (time.monotonic() - start) * 1000
            return elapsed_ms, 0

    def test_concurrent_invocations_p99_under_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """50 concurrent POST /api/v1/invocations; p99 must be < 500ms."""
        session_id = str(uuid4())
        response_times: list[float] = []
        status_codes: list[int] = []

        with ThreadPoolExecutor(max_workers=CONCURRENT_INVOCATIONS) as executor:
            futures = [
                executor.submit(
                    self._create_invocation,
                    nexus_api,
                    session_id,
                )
                for _ in range(CONCURRENT_INVOCATIONS)
            ]
            for future in as_completed(futures):
                elapsed_ms, status_code = future.result()
                response_times.append(elapsed_ms)
                status_codes.append(status_code)

        assert len(response_times) == CONCURRENT_INVOCATIONS

        client_p99 = compute_percentile(response_times, 99)
        client_p95 = compute_percentile(response_times, 95)

        server_errors = sum(1 for s in status_codes if s >= 500 or s == 0)

        assert client_p99 < TARGET_P99_MS, (
            f"Client-measured p99 response time {client_p99:.1f}ms exceeds target {TARGET_P99_MS}ms "
            f"(p95={client_p95:.1f}ms, server_errors={server_errors}/{CONCURRENT_INVOCATIONS})"
        )

        time.sleep(1)
        kpis_response = nexus_api.internal_metrics.get_component_kpis(component="api_service")
        kpis_response.assert_successful()
        kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
        server_metrics = kpis.get("metrics", {}).get("response_time_ms", {})
        if server_metrics.get("count", 0) > 0:
            server_p99 = server_metrics.get("p99", 0)
            assert server_p99 < TARGET_P99_MS, (
                f"Server-reported p99 response time {server_p99:.1f}ms exceeds target {TARGET_P99_MS}ms"
            )
