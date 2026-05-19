"""Suite 21 — Authentication Overhead: JWT Verification Overhead (21.1).

Test 21.1: 100 RPS to GET /api/v1/workflows with valid JWT
    KPI: JWT Verification Overhead < 5ms added per request
    MetricType: REQUEST_DURATION

Validation: Compare authenticated endpoint latency against the
    unauthenticated /health baseline to isolate JWT verification cost.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import pytest

from tests.performance.authentication.conftest import (
    SUSTAINED_DURATION_SECONDS,
    SUSTAINED_RPS,
    TARGET_JWT_OVERHEAD_MS,
)
from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
    timed_http_request,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance


class TestJWTVerificationOverhead:
    """21.1 — JWT verification overhead at 100 RPS.

    Sends sustained requests to an authenticated endpoint
    (GET /api/v1/workflows) and a baseline unauthenticated endpoint
    (/health), then compares p50 latency to measure the overhead
    attributable to ES256 JWT verification.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_jwt_overhead_under_target(
        self,
        nexus_base_url: str,
        admin_auth_headers: dict[str, str],
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Authenticated vs unauthenticated p50 delta must be < 5ms."""
        auth_times: list[float] = []
        baseline_times: list[float] = []

        interval = 1.0 / SUSTAINED_RPS
        end_time = time.monotonic() + SUSTAINED_DURATION_SECONDS

        while time.monotonic() < end_time:
            batch_start = time.monotonic()

            elapsed_auth, status_auth, _ = timed_http_request(
                nexus_base_url,
                "GET",
                "/api/v1/workflows?limit=1",
                headers=admin_auth_headers,
            )
            if status_auth == 200:
                auth_times.append(elapsed_auth)

            elapsed_health, status_health, _ = timed_http_request(
                nexus_base_url,
                "GET",
                "/health",
            )
            if status_health == 200:
                baseline_times.append(elapsed_health)

            elapsed = time.monotonic() - batch_start
            sleep_for = interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)

        assert len(auth_times) > 0, "No authenticated requests completed"
        assert len(baseline_times) > 0, "No baseline requests completed"

        auth_p50 = compute_percentile(auth_times, 50)
        baseline_p50 = compute_percentile(baseline_times, 50)
        overhead = auth_p50 - baseline_p50

        auth_p95 = compute_percentile(auth_times, 95)
        baseline_p95 = compute_percentile(baseline_times, 95)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
        )
        server_record_count = records.get("total", 0)

        diag = (
            f"auth_p50={auth_p50:.1f}ms, baseline_p50={baseline_p50:.1f}ms, "
            f"overhead={overhead:.1f}ms, auth_p95={auth_p95:.1f}ms, "
            f"baseline_p95={baseline_p95:.1f}ms, "
            f"auth_requests={len(auth_times)}, baseline_requests={len(baseline_times)}, "
            f"server_records={server_record_count}"
        )

        assert overhead < TARGET_JWT_OVERHEAD_MS, (
            f"JWT verification overhead {overhead:.1f}ms exceeds target {TARGET_JWT_OVERHEAD_MS}ms ({diag})"
        )
